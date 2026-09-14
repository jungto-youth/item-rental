// 2025 청년페스타 '물품대여' 시트 → rental_history 반영 스크립트
//
//   deno run -A server/scripts/import-rentals.ts                 미리보기 (DB 변경 없음, 기본)
//   deno run -A server/scripts/import-rentals.ts --apply         반영 (이미 있는 source_key 는 건너뜀)
//   deno run -A server/scripts/import-rentals.ts --apply --update  이미 있는 행까지 갱신
//
// 입력: data/sheet-import/review-rentals.csv
//   python3 data/sheet-import/build-rentals.py 가 raw_festa.json 의 '(2025)물품대여' 탭을
//   검토용 CSV 로 풀어 놓는다. 이 스크립트는 그 CSV 만 읽는다(DB 직접 입력은 하지 않는다).
//
// 규칙:
//   · '반영' 플래그가 O 인 행만 넣는다. X·보류는 사람이 결정할 때까지 건드리지 않는다.
//   · source_key 로 멱등하다 — 같은 시트를 다시 돌려도 중복이 쌓이지 않는다.
//   · item_id 는 best-effort 다. 물품ID 컬럼이 채워져 있으면 그 값을 쓰고, 없으면 물품명이
//     정확히 하나로 일치할 때만 연결한다. 동명이품·미매칭은 NULL 로 둔다 —
//     잘못된 연결보다 비어 있는 편이 낫다.
//   · 과거 시트의 '신청자'는 계정이 아니라 이름 문자열이라 members 에 INSERT 하지 않는다.
//     member_name 에 스냅샷으로만 남긴다(reservations 의 member_id NOT NULL 과 다른 점).
import { neon } from "@neondatabase/serverless";

// .env 로드 (repo 루트). import-items.ts 와 같은 방식 — 이미 있는 환경변수는 덮지 않는다.
try {
  const text = await Deno.readTextFile(new URL("../../.env", import.meta.url));
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (Deno.env.get(key) === undefined) {
      Deno.env.set(key, value.replace(/^["']|["']$/g, ""));
    }
  }
} catch {
  // .env 가 없으면 실제 환경변수를 그대로 쓴다.
}

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  console.error(
    "✗ DATABASE_URL 이 없습니다 — repo 루트 .env 또는 환경변수로 지정하세요.",
  );
  Deno.exit(1);
}

const args = new Set(Deno.args);
const APPLY = args.has("--apply");
const UPDATE = args.has("--update");
const sql = neon(DATABASE_URL);

// D1 바인딩이 아니라 Neon HTTP 드라이버라 sql.query(text, params) 형태로만 호출된다.
async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql.query(text, params)) as T[];
}

// 의존성 없는 최소 CSV 파서. 따옴표 안의 쉼표·개행을 처리한다.
// (import-items.ts 와 같은 구현 — 공용 모듈로 빼지 않고 각 스크립트가 자립하도록 둔다.)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

// 이름 대조용 정규화. 공백·괄호를 없애되 괄호 안 내용은 남긴다 —
// '멀티탭' 이 '멀티탭 (5구)' 에 잘못 붙는 것을 막는다.
function normName(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[()[\]{}]/g, "")
    .toLowerCase();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

type LinkSource = "manual" | "name" | "none" | "ambiguous";

interface Plan {
  key: string;
  row: number;
  itemName: string;
  manualItemId: string;
  itemId: number | null;
  linkSource: LinkSource;
  scope: string | null;
  memberName: string;
  org: string | null;
  qty: number | null;
  requestedOn: string | null;
  startAt: string | null;
  endAt: string | null;
  useLocation: string | null;
  procurement: string | null;
  checkoutState: string | null;
  returnState: string | null;
  returnLocation: string | null;
  note: string | null;
  internalNote: string | null;
}

// ── 1. CSV 읽기 ──────────────────────────────────────────────────────────────
const CSV_PATH = new URL(
  "../../data/sheet-import/review-rentals.csv",
  import.meta.url,
);
let csvText: string;
try {
  csvText = await Deno.readTextFile(CSV_PATH);
} catch {
  console.error(`✗ ${CSV_PATH.pathname} 를 읽을 수 없습니다.`);
  console.error(
    "  먼저 python3 data/sheet-import/build-rentals.py 를 실행하세요.",
  );
  Deno.exit(1);
}
if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);

const table = parseCsv(csvText);
if (table.length < 2) {
  console.error("✗ CSV 에 데이터 행이 없습니다.");
  Deno.exit(1);
}
const header = table[0].map((h) => h.trim());
const rows = table.slice(1);

function cell(row: string[], name: string): string {
  const i = header.indexOf(name);
  return i === -1 ? "" : (row[i] ?? "").trim();
}
const nn = (s: string): string | null => (s === "" ? null : s);

// ── 2. 행 → Plan (검증 실패는 모아서 한 번에 보고하고 중단) ─────────────────
const errors: string[] = [];
const plans: Plan[] = [];
let skippedFlag = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (cell(row, "반영") !== "O") {
    skippedFlag++;
    continue;
  }

  const key = cell(row, "ID");
  const itemName = cell(row, "대여물품");
  const memberName = cell(row, "신청자");
  const where = `review-rentals.csv:${i + 2} (${key || "ID 없음"})`;

  if (key === "") errors.push(`${where} — ID 가 비어 있습니다.`);
  if (itemName === "") errors.push(`${where} — 대여물품이 비어 있습니다.`);
  if (memberName === "") errors.push(`${where} — 신청자가 비어 있습니다.`);

  const qtyRaw = cell(row, "수량");
  let qty: number | null = null;
  if (qtyRaw !== "") {
    qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      errors.push(
        `${where} — 수량 '${qtyRaw}' 을 1 이상의 정수로 읽을 수 없습니다.`,
      );
    }
  }

  const requestedOn = nn(cell(row, "신청일"));
  if (requestedOn && !DATE_RE.test(requestedOn)) {
    errors.push(
      `${where} — 신청일 '${requestedOn}' 형식이 YYYY-MM-DD 가 아닙니다.`,
    );
  }
  const startAt = nn(cell(row, "시작일시"));
  if (startAt && !TS_RE.test(startAt)) {
    errors.push(
      `${where} — 시작일시 '${startAt}' 형식이 YYYY-MM-DD[ HH:MM] 이 아닙니다.`,
    );
  }
  const endAt = nn(cell(row, "종료일시"));
  if (endAt && !TS_RE.test(endAt)) {
    errors.push(
      `${where} — 종료일시 '${endAt}' 형식이 YYYY-MM-DD[ HH:MM] 이 아닙니다.`,
    );
  }
  if (startAt && endAt && startAt > endAt) {
    errors.push(
      `${where} — 시작일시(${startAt})가 종료일시(${endAt})보다 늦습니다.`,
    );
  }

  const sourceRow = Number(cell(row, "원본행"));
  if (!Number.isInteger(sourceRow) || sourceRow < 1) {
    errors.push(
      `${where} — 원본행 '${cell(row, "원본행")}' 을 정수로 읽을 수 없습니다.`,
    );
  }

  plans.push({
    key,
    row: sourceRow,
    itemName,
    manualItemId: cell(row, "물품ID"),
    itemId: null,
    linkSource: "none",
    scope: nn(cell(row, "구분")),
    memberName,
    org: nn(cell(row, "소속")),
    qty,
    requestedOn,
    startAt,
    endAt,
    useLocation: nn(cell(row, "사용위치")),
    procurement: nn(cell(row, "조달여부")),
    checkoutState: nn(cell(row, "출고상태")),
    returnState: nn(cell(row, "반납여부")),
    returnLocation: nn(cell(row, "반납위치")),
    note: nn(cell(row, "비고")),
    internalNote: nn(cell(row, "내부메모")),
  });
}

if (errors.length > 0) {
  console.error(`✗ 검증 실패 ${errors.length}건 — DB 는 건드리지 않았습니다.`);
  for (const e of errors.slice(0, 40)) console.error(`  · ${e}`);
  if (errors.length > 40) console.error(`  … 외 ${errors.length - 40}건`);
  Deno.exit(1);
}

// ── 3. DB 준비 확인 ─────────────────────────────────────────────────────────
const cols = await query<{ column_name: string }>(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'rental_history'`,
);
if (cols.length === 0) {
  console.error("✗ rental_history 테이블이 없습니다.");
  console.error(
    "  npm run db:migrate 를 먼저 실행하세요 (migrations/0012_rental_history.sql).",
  );
  Deno.exit(1);
}

const existingRows = await query<{ source_key: string }>(
  `SELECT source_key FROM rental_history`,
);
const existing = new Set(existingRows.map((r) => r.source_key));

const items = await query<{ id: number; name: string }>(
  `SELECT id, name FROM items`,
);
const itemIds = new Set(items.map((it) => it.id));
const byNorm = new Map<string, number[]>();
for (const it of items) {
  const k = normName(it.name);
  const arr = byNorm.get(k);
  if (arr) arr.push(it.id);
  else byNorm.set(k, [it.id]);
}

// ── 4. item_id 연결 ─────────────────────────────────────────────────────────
const linkErrors: string[] = [];
let linkedManual = 0;
let linkedName = 0;

for (const p of plans) {
  if (p.manualItemId !== "") {
    const n = Number(p.manualItemId);
    if (!Number.isInteger(n) || !itemIds.has(n)) {
      linkErrors.push(
        `review-rentals.csv:${p.row} (${p.key}) — 물품ID '${p.manualItemId}' 에 해당하는 물품이 items 에 없습니다.`,
      );
      continue;
    }
    p.itemId = n;
    p.linkSource = "manual";
    linkedManual++;
    continue;
  }

  const hit = byNorm.get(normName(p.itemName));
  if (!hit) continue;
  if (hit.length > 1) {
    p.linkSource = "ambiguous";
    continue;
  }
  p.itemId = hit[0];
  p.linkSource = "name";
  linkedName++;
}

if (linkErrors.length > 0) {
  console.error(
    `✗ 물품ID 검증 실패 ${linkErrors.length}건 — DB 는 건드리지 않았습니다.`,
  );
  for (const e of linkErrors.slice(0, 20)) console.error(`  · ${e}`);
  Deno.exit(1);
}

// ── 5. 요약 ─────────────────────────────────────────────────────────────────
const fresh = plans.filter((p) => !existing.has(p.key));
const dup = plans.filter((p) => existing.has(p.key));
const ambiguous = plans.filter((p) => p.linkSource === "ambiguous").length;
const unlinked = plans.filter((p) => p.itemId === null).length;

console.log(
  `\n${APPLY ? (UPDATE ? "[반영·갱신]" : "[반영]") : "[미리보기]"} rental_history — 시트 ${rows.length}행`,
);
console.log(`  반영 대상(O)        ${plans.length}건`);
console.log(`    신규              ${fresh.length}건`);
console.log(
  `    이미 있음          ${dup.length}건 ${UPDATE ? "→ 갱신" : "(건너뜀)"}`,
);
console.log(`  건너뜀(X·보류)      ${skippedFlag}건`);
console.log(
  `  item_id 연결        ${linkedManual + linkedName}건 (물품ID 지정 ${linkedManual} / 이름 일치 ${linkedName})`,
);
console.log(`    동명이품으로 보류   ${ambiguous}건`);
console.log(`    연결 안 됨         ${unlinked}건 — NULL 로 저장`);

if (unlinked > 0) {
  const missCount = new Map<string, number>();
  for (const p of plans) {
    if (p.itemId === null)
      missCount.set(p.itemName, (missCount.get(p.itemName) ?? 0) + 1);
  }
  const topMiss = [...missCount]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 15);
  console.log(
    `\n  자주 대여됐지만 연결되지 않은 물품 (상위 ${topMiss.length}) — review-rentals.csv 의 '물품ID' 컬럼을 채우면 정확히 연결됩니다:`,
  );
  for (const [name, n] of topMiss) {
    console.log(`    ${String(n).padStart(3)}회  ${name}`);
  }
}

if (!APPLY) {
  console.log(
    "\n미리보기였습니다 — DB 는 바뀌지 않았습니다. 반영하려면 --apply 를 붙이세요.\n",
  );
  Deno.exit(0);
}

// ── 6. 반영 ─────────────────────────────────────────────────────────────────
const INSERT = `INSERT INTO rental_history (
  source_key, source_row, item_name, item_id, item_scope, member_name, org, qty,
  requested_on, start_at, end_at, use_location, procurement, checkout_state,
  return_state, return_location, note, internal_note
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`;

const UPDATE_SQL = `UPDATE rental_history SET
  source_row = $2, item_name = $3, item_id = $4, item_scope = $5, member_name = $6, org = $7,
  qty = $8, requested_on = $9, start_at = $10, end_at = $11, use_location = $12,
  procurement = $13, checkout_state = $14, return_state = $15, return_location = $16,
  note = $17, internal_note = $18
WHERE source_key = $1`;

const params = (p: Plan) => [
  p.key,
  p.row,
  p.itemName,
  p.itemId,
  p.scope,
  p.memberName,
  p.org,
  p.qty,
  p.requestedOn,
  p.startAt,
  p.endAt,
  p.useLocation,
  p.procurement,
  p.checkoutState,
  p.returnState,
  p.returnLocation,
  p.note,
  p.internalNote,
];

const targets = UPDATE ? plans : fresh;
let inserted = 0;
let updated = 0;
let failed = 0;

for (const p of targets) {
  const isUpdate = existing.has(p.key);
  try {
    await query(isUpdate ? UPDATE_SQL : INSERT, params(p));
    if (isUpdate) updated++;
    else inserted++;
    console.log(
      `  + ${p.key}  ${p.itemName} × ${p.qty ?? "-"}  ${p.memberName}`,
    );
  } catch (e) {
    failed++;
    console.error(`  ✗ ${p.key} — ${(e as Error).message}`);
  }
}

const [count] = await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM rental_history`,
);
const [nulls] = await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM rental_history WHERE item_id IS NULL`,
);

console.log(
  `\n반영 완료 — 신규 ${inserted} / 갱신 ${updated} / 실패 ${failed}`,
);
console.log(`  rental_history 총 ${count.n}건`);
console.log(
  `  item_id 미연결 ${nulls.n}건 (정상 — 과거 시트의 자유텍스트 품목명)`,
);
if (failed > 0) Deno.exit(1);
