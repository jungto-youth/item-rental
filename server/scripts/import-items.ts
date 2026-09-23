// 물품리스트(구글시트) → D1 반영 SQL 생성 스크립트 (PLAN §8)
//   deno task db:import-items                                      미리보기 + out/import-*.sql 생성
//   deno run -A server/scripts/import-items.ts --file=xa-review.csv  다른 CSV 사용 (회관물품)
//   npx wrangler d1 execute item-rental-db --local  --file=server/scripts/out/import-review.sql
//   npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/import-review.sql
//
// 입력: data/sheet-import/review.csv (python3 data/sheet-import/review.py 로 생성)
//   '반영' 컬럼이 O 인 행만 반영한다. X(제외)·보류는 건너뛴다.
//
// 멱등성: CSV 의 ID(Y26-###·XA10##)를 items.source_key 에 저장한다.
//   INSERT 는 같은 source_key 가 있으면 건너뛴다(NOT EXISTS) — 파일 재적용도 안전.
//   --update 를 주면 기존 행도 갱신 문장에 넣는다(없으면 무시됨) — 이름·설명·수량·상태·위치.
//
// 주의: 워커 밖에선 Workers AI 를 부를 수 없어 임베딩이 만들어지지 않는다 — 적용 후
//   POST /api/admin/reembed-all 을 반복 호출해 채운다(PLAN §8). 임베딩이 없어도
//   키워드 검색(FTS·LIKE)은 동작한다.

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
  status: ItemStatus;
  kind: "rental" | "consumable";
  location: string | null;
};

const args = new Set(Deno.args);
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

const ITEM_STATUS = ["active", "repair", "retired"] as const;
type ItemStatus = (typeof ITEM_STATUS)[number];

// 시트에는 kind 컬럼이 없다 — 유일하게 확실한 소모품 신호는 이름의 '일회용'
// (젓가락·스푼·물티슈 3건). 나머지는 전부 대여품으로 넣고 관리자 화면에서 고친다.
function toKind(name: string): "rental" | "consumable" {
  return name.includes("일회용") ? "consumable" : "rental";
}

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
  if (flag !== "O") continue; // X(제외)·보류는 건너뛴다
  const id = col(row, "ID");
  const name = col(row, "사이트명");
  const total_qty = Number(col(row, "수량"));
  const status = (col(row, "상태") || "active") as ItemStatus;

  if (!id) errors.push(`ID 없음: ${name}`);
  else if (!name) errors.push(`${id}: 사이트명이 비었습니다`);
  // items.total_qty 는 NOT NULL CHECK(>=1) — 0 이나 공백이면 반영 불가
  else if (!Number.isInteger(total_qty) || total_qty < 1)
    errors.push(
      `${id}: 수량이 1 이상 정수가 아닙니다 ("${col(row, "수량")}") — 아직 미확정이면 '반영'을 보류로 바꾸세요`,
    );
  else if (ITEM_STATUS.includes(status)) {
    // 시트의 원본사이즈는 0016 이후 컬럼이 없으므로 공개 description 으로 접는다
    // (backfill-remove-item-attrs.ts 와 같은 '규격: …' 규칙). 내부메모_비고(note)는
    // 관리자 전용 필드로 0016 에서 제거 — 가져오지 않는다. color 는 시트에 컬럼이 없다.
    const rawDesc = col(row, "설명");
    const size = col(row, "원본사이즈");
    plan.push({
      id,
      name,
      description: size
        ? (rawDesc ? `${rawDesc} (규격: ${size})` : `규격: ${size}`)
        : (rawDesc || null),
      total_qty,
      status,
      kind: toKind(name),
      location: col(row, "위치") || null,
    });
  } else errors.push(`${id}: 상태 값 오류 ("${status}")`);
}

if (errors.length) {
  console.error(`검증 실패 ${errors.length}건 — SQL을 생성하지 않습니다:`);
  for (const e of errors.slice(0, 40)) console.error(`  ✗ ${e}`);
  if (errors.length > 40) console.error(`  … 외 ${errors.length - 40}건`);
  Deno.exit(1);
}

// --- SQL 생성 ---
// SQL 문자열 리터럴 — ' 를 '' 로 이중화
const q = (v: string | null) =>
  v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;

const stmts: string[] = [];
for (const p of plan) {
  // 멱등 가드 — 같은 source_key 가 있으면 건너뛴다
  stmts.push(
    `INSERT INTO items (name, description, status, total_qty, source_key, kind, location)\n` +
      `SELECT ${q(p.name)}, ${q(p.description)}, ${q(p.status)}, ${p.total_qty}, ${q(p.id)}, ${q(p.kind)}, ${q(p.location)}\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM items WHERE source_key = ${q(p.id)});`,
  );
  // INSERT가 0행이어도(이미 있음) FTS 행이 없으면 채운다
  stmts.push(
    `INSERT INTO items_fts (rowid, name, description, location, tags)\n` +
      `SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(i.location, ''), ''\n` +
      `FROM items i WHERE i.source_key = ${q(p.id)}\n` +
      `  AND NOT EXISTS (SELECT 1 FROM items_fts WHERE rowid = i.id);`,
  );
  if (UPDATE) {
    // 기존 행 갱신 — 없는 key면 무시된다(0행 UPDATE)
    stmts.push(
      `UPDATE items SET name = ${q(p.name)}, description = ${q(p.description)}, status = ${q(p.status)},\n` +
        `       total_qty = ${p.total_qty}, kind = ${q(p.kind)}, location = ${q(p.location)}\n` +
        `WHERE source_key = ${q(p.id)};`,
    );
    // 갱신된 텍스트를 FTS에도 반영 — DELETE+INSERT(FTS5는 UPSERT 미지원)
    stmts.push(
      `DELETE FROM items_fts WHERE rowid IN (SELECT id FROM items WHERE source_key = ${q(p.id)});\n` +
        `INSERT INTO items_fts (rowid, name, description, location, tags)\n` +
        `SELECT id, name, COALESCE(description, ''), COALESCE(location, ''), ''\n` +
        `FROM items WHERE source_key = ${q(p.id)};`,
    );
  }
}

const outDir = new URL("./out/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });
const out = new URL(`./out/import-${csvName}`, import.meta.url);
await Deno.writeTextFile(
  out,
  `-- ${csvName} 시트 반영 (deno task db:import-items 생성${UPDATE ? ", --update" : ""}) — INSERT 는 멱등 가드\n\n` +
    stmts.join("\n") +
    "\n",
);

console.log(
  `${csvName} ${table.length - 1}건 중 반영대상 O ${plan.length}건${UPDATE ? " (--update 포함)" : ""}`,
);
console.log("\n반영 예정:");
for (const p of plan.slice(0, 200)) {
  const extra =
    p.status === "repair"
      ? " [수리중]"
      : p.kind === "consumable"
        ? " [소모품]"
        : "";
  console.log(
    `  + ${p.id} ${p.name} — ${p.total_qty}개${extra}${p.location ? ` @${p.location}` : ""}`,
  );
}
if (plan.length > 200) console.log(`  … 외 ${plan.length - 200}건`);

console.log(`\n생성: server/scripts/out/import-${csvName} (${stmts.length}문장, 멱등 가드 포함)`);
console.log("\n적용:");
console.log(
  `  npx wrangler d1 execute item-rental-db --local  --file=server/scripts/out/import-${csvName}`,
);
console.log(
  `  npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/import-${csvName}`,
);
console.log("\n⚠ 임베딩: 적용 후 POST /api/admin/reembed-all 을 next_after가 null일 때까지 반복 호출하세요.");
console.log("  (Workers AI는 워커 안에서만 호출 가능 — 임베딩 없이도 키워드 검색은 동작한다)");
