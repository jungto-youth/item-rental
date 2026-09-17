// 물품리스트(구글시트) → items 반영 스크립트
//   deno run -A server/scripts/import-items.ts                     미리보기 (DB 변경 없음, 기본)
//   deno run -A server/scripts/import-items.ts --apply             실제 반영
//   deno run -A server/scripts/import-items.ts --file=xa-review.csv  다른 CSV 사용 (회관물품)
//
// 입력: data/sheet-import/review.csv (python3 data/sheet-import/review.py 로 생성)
//   '반영' 컬럼이 O 인 행만 반영한다. X(제외)·보류는 건너뛴다.
//
// 멱등성: CSV 의 ID(Y26-###·XA10##)를 items.source_key 에 저장한다.
//   같은 ID 가 이미 있으면 건너뛰고, --update 를 주면 이름·설명·수량·기간·상태를 갱신한다.
//   (migrations/0008_items_source_key.sql 의 부분 유니크 인덱스가 이를 보장한다)
//
// 주의: 여기서는 임베딩(Workers AI)을 만들 수 없다 — Deno 스크립트에는 AI 바인딩이 없다.
//   직접 INSERT 한 물품은 embedding 이 NULL 이라 '의미 검색'에는 안 나오고 키워드 검색으로만 잡힌다.
//   반영 후 관리자 화면에서 한 번씩 저장하거나 embedding 백필을 돌려 채운다.
import { neon } from "@neondatabase/serverless";

// --- .env 로드 (migrate.ts·seed.ts 와 동일 패턴, 실제 환경변수 우선) ---
try {
  const envFile = await Deno.readTextFile(
    new URL("../../.env", import.meta.url),
  );
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && Deno.env.get(m[1]) === undefined) {
      Deno.env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
    }
  }
} catch {
  // .env 없으면 건너뜀
}

const args = new Set(Deno.args);
const APPLY = args.has("--apply");
const UPDATE = args.has("--update");

// --file=xa-review.csv — 시트별로 CSV 를 나눠 쓴다 (review.csv=청년물품, xa-review.csv=회관물품)
const fileArg = [...args].find((a) => a.startsWith("--file="));
const csvName = fileArg ? fileArg.slice("--file=".length) : "review.csv";
if (!/^[\w.-]+\.csv$/.test(csvName)) {
  console.error(
    `--file 값이 올바르지 않습니다: ${csvName} (예: --file=xa-review.csv)`,
  );
  Deno.exit(1);
}

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL 미설정 — .env 파일(또는 환경변수)을 확인하세요");
  Deno.exit(1);
}

const ITEM_STATUS = ["active", "repair", "retired"] as const;
type ItemStatus = (typeof ITEM_STATUS)[number];

// 시트에는 kind 컬럼이 없다 — 유일하게 확실한 소모품 신호는 이름의 '일회용'
// (젓가락·스푼·물티슈 3건). 나머지는 전부 대여품으로 넣고 관리자 화면에서 고친다.
function toKind(name: string): "rental" | "consumable" {
  return name.includes("일회용") ? "consumable" : "rental";
}

// --- CSV 파서 (따옴표·개행 포함 필드 지원, 의존성 없이) ---
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  // 완전히 빈 행 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

type Plan = {
  id: string;
  name: string;
  description: string | null;
  total_qty: number;
  max_days: number;
  status: ItemStatus;
  kind: "rental" | "consumable";
  location: string | null;
  size: string | null;
  note: string | null;
  action: "insert" | "update" | "skip";
  reason: string;
};

const csvPath = new URL(`../../data/sheet-import/${csvName}`, import.meta.url);
let csvText: string;
try {
  csvText = await Deno.readTextFile(csvPath);
} catch {
  console.error(`${csvName} 없음 — data/sheet-import/ 를 확인하세요`);
  Deno.exit(1);
}
// utf-8-sig BOM 제거
if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);

const table = parseCsv(csvText);
if (table.length < 2) {
  console.error("review.csv 에 데이터 행이 없습니다");
  Deno.exit(1);
}
const header = table[0].map((h) => h.trim());
const col = (row: string[], name: string) => {
  const i = header.indexOf(name);
  return i === -1 ? "" : (row[i] ?? "").trim();
};

const errors: string[] = [];
const plan: Plan[] = [];

for (const row of table.slice(1)) {
  const flag = col(row, "반영").toUpperCase();
  if (flag !== "O") continue; // X(제외)·보류는 건너뜀
  const id = col(row, "ID");
  const name = col(row, "사이트명");
  const total_qty = Number(col(row, "수량"));
  const max_days = Number(col(row, "최대대여일")) || 7;
  const status = (col(row, "상태") || "active") as ItemStatus;

  if (!id) errors.push(`ID 없음: ${name}`);
  else if (!name) errors.push(`${id}: 사이트명이 비었습니다`);
  // items.total_qty 는 NOT NULL CHECK(>=1) — 0 이나 공백이면 반영 불가
  else if (!Number.isInteger(total_qty) || total_qty < 1)
    errors.push(
      `${id}: 수량이 1 이상 정수가 아닙니다 ("${col(row, "수량")}") — 아직 미확정이면 '반영'을 보류로 바꾸세요`,
    );
  else if (!Number.isInteger(max_days) || max_days < 1 || max_days > 365)
    errors.push(
      `${id}: 최대대여일이 1~365 범위가 아닙니다 ("${col(row, "최대대여일")}")`,
    );
  else if (ITEM_STATUS.includes(status)) {
    // 시트의 내부 메모(비고/특이사항)는 공개 description 이 아니라 items.note 로 보존한다.
    // color 는 자동 파생하지 않는다 — '녹회색' 등이 이름에 있어도 추출이 던지지
    // 않아(예: '카키색 조끼 (2XL)'), 관리자가 필요한 만큼만 직접 채운다.
    plan.push({
      id,
      name,
      description: col(row, "설명") || null,
      total_qty,
      max_days,
      status,
      kind: toKind(name),
      location: col(row, "위치") || null,
      size: col(row, "원본사이즈") || null,
      note: col(row, "내부메모_비고") || null,
      action: "insert",
      reason: "",
    });
  } else errors.push(`${id}: 상태 값 오류 ("${status}")`);
}

if (errors.length) {
  console.error(`검증 실패 ${errors.length}건 — 반영하지 않았습니다:`);
  for (const e of errors.slice(0, 40)) console.error(`  ✗ ${e}`);
  if (errors.length > 40) console.error(`  … 외 ${errors.length - 40}건`);
  Deno.exit(1);
}

const sql = neon(url);

// migrations/0008(source_key)·0010(kind/location/…)·0011(category 제거) 적용 여부 확인 —
// 미적용이면 멱등 키나 신규 컬럼이 없어 반영이 불가능하다
const cols = (await sql.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'items'
     AND column_name IN ('source_key', 'kind', 'location', 'size', 'note')`,
)) as { column_name: string }[];
const have = new Set(cols.map((r) => r.column_name));
const hasSourceKey = have.has("source_key");
const missingCols = ["source_key", "kind", "location", "size", "note"].filter(
  (c) => !have.has(c),
);
if (missingCols.length) {
  console.error(`⚠ items 테이블에 컬럼이 없습니다: ${missingCols.join(", ")}`);
  console.error("  먼저 마이그레이션을 적용하세요: deno task db:migrate");
  if (APPLY) Deno.exit(1);
}

// 기존 source_key 목록 — 이미 들어간 건 건너뛴다
const existing = hasSourceKey
  ? ((await sql.query(
      "SELECT id, source_key FROM items WHERE source_key IS NOT NULL",
    )) as {
      id: number;
      source_key: string;
    }[])
  : [];
const haveKey = new Map(existing.map((r) => [r.source_key, r.id]));

for (const p of plan) {
  if (!haveKey.has(p.id)) continue;
  p.action = UPDATE ? "update" : "skip";
  p.reason = UPDATE ? "기존 항목 갱신" : "이미 반영됨";
}

const inserts = plan.filter((p) => p.action === "insert");
const updates = plan.filter((p) => p.action === "update");
const skips = plan.filter((p) => p.action === "skip");

console.log(
  `${APPLY ? "[반영]" : "[미리보기]"} ${csvName} ${table.length - 1}건 중 반영대상 O ${plan.length}건`,
);
console.log(
  `  신규 ${inserts.length} / 갱신 ${updates.length} / 건너뜀 ${skips.length}${UPDATE ? "" : " (--update 로 갱신 가능)"}`,
);
console.log("\n신규 등록 예정:");
for (const p of inserts.slice(0, 200)) {
  const extra =
    p.status === "repair"
      ? " [수리중]"
      : p.kind === "consumable"
        ? " [소모품]"
        : "";
  console.log(
    `  + ${p.id} ${p.name} — ${p.total_qty}개, 최대 ${p.max_days}일${extra}${p.size ? ` (${p.size})` : ""}${p.location ? ` @${p.location}` : ""}`,
  );
}
if (updates.length) {
  console.log("\n갱신 예정:");
  for (const p of updates)
    console.log(
      `  ~ ${p.id} ${p.name} — ${p.total_qty}개, 최대 ${p.max_days}일`,
    );
}
if (skips.length) {
  console.log(`\n건너뜀: ${skips.length}건 (이미 반영됨)`);
}

if (!APPLY) {
  console.log("\nDB 는 변경하지 않았습니다. 실제 반영하려면:");
  console.log(
    `  deno run -A server/scripts/import-items.ts --apply${csvName === "review.csv" ? "" : ` --file=${csvName}`}`,
  );
  Deno.exit(0);
}

// --- 실제 반영 ---
let added = 0;
let updated = 0;
for (const p of inserts) {
  await sql.query(
    `INSERT INTO items (name, description, status, total_qty, max_days, source_key,
                        kind, location, size, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      p.name,
      p.description,
      p.status,
      p.total_qty,
      p.max_days,
      p.id,
      p.kind,
      p.location,
      p.size,
      p.note,
    ],
  );
  added++;
}
for (const p of updates) {
  await sql.query(
    `UPDATE items SET name = $2, description = $3, status = $4, total_qty = $5, max_days = $6,
            kind = $7, location = $8, size = $9, note = $10
     WHERE source_key = $1`,
    [
      p.id,
      p.name,
      p.description,
      p.status,
      p.total_qty,
      p.max_days,
      p.kind,
      p.location,
      p.size,
      p.note,
    ],
  );
  updated++;
}
console.log(`\n반영 완료 — 신규 ${added}건, 갱신 ${updated}건`);

// 임베딩 상태 점검 (의미 검색 누락 여부)
const [missing] = (await sql.query(
  "SELECT COUNT(*)::int AS n FROM items WHERE embedding IS NULL",
)) as { n: number }[];
if (missing?.n) {
  console.log(
    `\n⚠ embedding 이 없는 물품 ${missing.n}건 — 키워드 검색으로만 노출됩니다.\n` +
      "  관리자 화면에서 해당 물품을 저장하면 임베딩이 생성됩니다 (임베딩은 서버의 Workers AI 바인딩이 필요해 스크립트에서 못 만듭니다).",
  );
}
