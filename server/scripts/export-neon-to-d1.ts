// Neon(PostgreSQL) → D1(SQLite) 데이터 펌프 — PLAN §9 데이터 이관용
//
// 사용:
//   deno task db:export-neon          # .env의 DATABASE_URL에서 읽어 out/d1-data.sql 생성
//   npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/d1-data.sql
//
// ⚠ 파일은 대상 테이블을 먼저 DELETE 한다(재적용 멱등) — 반드시 **새로 만든 D1
//   데이터베이스**에만 적용할 것. 생성 시점의 행수 요약이 콘솔에 출력되고, 적용 후
//   wrangler d1 execute ... --command "SELECT COUNT(*) FROM items" 등으로 대사한다(§9.3).
//
// 변환 규칙(PLAN §4·§6):
//   - embedding: pgvector '[0.1,...]' 텍스트 → f32 little-endian BLOB X'hex' 리터럴
//   - timestamptz: 그대로 ISO 문자열 (D1 TEXT 컬럼, 앱의 strftime 출력과 같은 형태)
//   - items_fts: items+categories+item_categories 에서 태그(카테고리 이름 공백 조인)를
//     재구성해 함께 생성 — 앱의 syncItemFts와 같은 텍스트 규칙(PLAN §7.3)
import { neon } from "@neondatabase/serverless";

// --- .env 로드 (실제 환경변수 우선) ---
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
  // .env 없으면 환경변수에서 읽음
}

const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL 미설정 — .env 파일(또는 환경변수)을 확인하세요");
  Deno.exit(1);
}
try {
  console.log(`원본(DB 대상): ${new URL(url).host}`);
} catch {
  // 파싱 실패는 neon() 이 오류를 낸다
}
const sql = neon(url);

// --- SQL 값 직렬화 ---
const q = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  // neon HTTP 드라이버는 timestamptz 를 Date 객체로 돌려준다 — D1 TEXT 형태(ISO ms)로
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

// pgvector 텍스트 '[0.1,...]' → f32 LE BLOB X'hex' (앱의 vecToBlob와 동일 직렬화)
function embeddingLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  const text = typeof v === "string"
    ? v
    : Array.isArray(v)
    ? `[${v.join(",")}]`
    : null;
  if (!text || !(text.startsWith("[") && text.endsWith("]"))) {
    throw new Error(`embedding 형식 예상 외: ${typeof v}`);
  }
  const floats = text.slice(1, -1).split(",").map(Number);
  // filter(Boolean) 은 쓰지 않는다 — 0.0 성분이 드롭돼 차원 검사가 오탐한다
  if (floats.length !== 1024 || floats.some((n) => !Number.isFinite(n))) {
    throw new Error(`embedding 파싱 실패: 유효 차원 ${floats.length} (기대 1024)`);
  }
  const buf = new ArrayBuffer(floats.length * 4);
  const dv = new DataView(buf);
  floats.forEach((f, i) => dv.setFloat32(i * 4, f, true));
  return `X'${
    Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
  }'`;
}

type Member = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  created_at: unknown;
  deactivated_at: unknown;
};
type Category = { id: number; name: string; created_at: unknown };
type Item = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  total_qty: number;
  created_at: unknown;
  embedding: unknown;
  source_key: string | null;
  kind: string;
  location: string | null;
  qty_broken: number;
};
type Photo = {
  id: number;
  item_id: number;
  r2_key: string;
  sort_order: number;
};
type Reservation = {
  id: number;
  item_id: number;
  member_id: string;
  status: string;
  member_memo: string | null;
  admin_id: string | null;
  created_at: unknown;
  updated_at: unknown;
  qty: number;
};
type AllowedEmail = {
  id: string;
  email: string;
  note: string | null;
  created_by: string | null;
  created_at: unknown;
};

// FK 의존 순서로 읽기
const members = (await sql`
  SELECT id, email, name, phone, role, created_at, deactivated_at
    FROM members ORDER BY id`) as Member[];
const categories = (await sql`
  SELECT id, name, created_at FROM categories ORDER BY id`) as Category[];
const items = (await sql`
  SELECT id, name, description, status, total_qty, created_at, embedding,
         source_key, kind, location, qty_broken
    FROM items ORDER BY id`) as Item[];
const itemCategories = (await sql`
  SELECT item_id, category_id FROM item_categories ORDER BY item_id, category_id`) as {
  item_id: number;
  category_id: number;
}[];
const photos = (await sql`
  SELECT id, item_id, r2_key, sort_order FROM item_photos ORDER BY id`) as Photo[];
const reservations = (await sql`
  SELECT id, item_id, member_id, status, member_memo, admin_id, created_at, updated_at, qty
    FROM reservations ORDER BY id`) as Reservation[];
const allowedEmails = (await sql`
  SELECT id, email, note, created_by, created_at FROM allowed_emails ORDER BY id`) as AllowedEmail[];

// items_fts 태그 재구성 — 카테고리 이름 공백 조인(이름순, syncItemFts와 같은 규칙)
const catName = new Map(categories.map((c) => [c.id, c.name]));
const tagLists = new Map<number, string[]>();
for (const ic of itemCategories) {
  const name = catName.get(ic.category_id);
  if (name === undefined) continue; // 데이터 정합 깨진 조인 행 — 건너뜀
  const list = tagLists.get(ic.item_id) ?? [];
  list.push(name);
  tagLists.set(ic.item_id, list);
}

const stmts: string[] = [];

// 재적용 멱등 — FK 역순 DELETE (⚠ 새 D1 데이터베이스에만 적용할 것)
stmts.push(
  "-- ⚠ 기존 데이터를 지운다 — 반드시 새로 만든 D1 데이터베이스에만 적용할 것\n" +
    "DELETE FROM item_categories;\nDELETE FROM item_photos;\nDELETE FROM reservations;\n" +
    "DELETE FROM items_fts;\nDELETE FROM items;\nDELETE FROM categories;\n" +
    "DELETE FROM members;\nDELETE FROM allowed_emails;",
);

// 행 단위 INSERT — items 행은 임베딩 hex(≈4KB)가 들어 multi-row로 묶으면 D1 의
// 문장 크기 한계(SQLITE_TOOBIG)에 걸린다
const ins = (table: string, cols: string, values: string[]) => {
  if (values.length === 0) {
    stmts.push(`-- ${table}: 데이터 없음`);
    return;
  }
  for (const v of values) {
    stmts.push(`INSERT INTO ${table} (${cols}) VALUES ${v};`);
  }
};

ins(
  "members",
  "id, email, name, phone, role, created_at, deactivated_at",
  members.map((m) =>
    `(${q(m.id)}, ${q(m.email)}, ${q(m.name)}, ${q(m.phone)}, ${q(m.role)}, ${q(m.created_at)}, ${q(m.deactivated_at)})`
  ),
);
ins("categories", "id, name, created_at", categories.map((c) =>
  `(${q(c.id)}, ${q(c.name)}, ${q(c.created_at)})`
));
ins(
  "items",
  "id, name, description, status, total_qty, created_at, embedding, source_key, kind, location, qty_broken",
  items.map((it) =>
    `(${q(it.id)}, ${q(it.name)}, ${q(it.description)}, ${q(it.status)}, ${q(it.total_qty)}, ${q(it.created_at)}, ${embeddingLiteral(it.embedding)}, ${q(it.source_key)}, ${q(it.kind)}, ${q(it.location)}, ${q(it.qty_broken)})`
  ),
);
ins("item_categories", "item_id, category_id", itemCategories.map((ic) =>
  `(${q(ic.item_id)}, ${q(ic.category_id)})`
));
ins("item_photos", "id, item_id, r2_key, sort_order", photos.map((p) =>
  `(${q(p.id)}, ${q(p.item_id)}, ${q(p.r2_key)}, ${q(p.sort_order)})`
));
ins(
  "reservations",
  "id, item_id, member_id, status, member_memo, admin_id, created_at, updated_at, qty",
  reservations.map((r) =>
    `(${q(r.id)}, ${q(r.item_id)}, ${q(r.member_id)}, ${q(r.status)}, ${q(r.member_memo)}, ${q(r.admin_id)}, ${q(r.created_at)}, ${q(r.updated_at)}, ${q(r.qty)})`
  ),
);
ins(
  "allowed_emails",
  "id, email, note, created_by, created_at",
  allowedEmails.map((a) =>
    `(${q(a.id)}, ${q(a.email)}, ${q(a.note)}, ${q(a.created_by)}, ${q(a.created_at)})`
  ),
);
ins(
  "items_fts",
  "rowid, name, description, location, tags",
  items.map((it) => {
    const tags = (tagLists.get(it.id) ?? []).sort().join(" ");
    return `(${q(it.id)}, ${q(it.name)}, ${q(it.description ?? "")}, ${q(it.location ?? "")}, ${q(tags)})`;
  }),
);

const outDir = new URL("./out/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });
const out = new URL("./out/d1-data.sql", import.meta.url);
await Deno.writeTextFile(
  out,
  `-- Neon → D1 데이터 펌프 결과 (db:export-neon 생성)\n\n` +
    stmts.join("\n\n") +
    "\n",
);

console.log("행수 요약 (§9.3 대사 기준 — 적용 후 D1에서 COUNT 비교):");
for (const [t, n] of [
  ["members", members.length],
  ["categories", categories.length],
  ["items", items.length],
  ["item_categories", itemCategories.length],
  ["item_photos", photos.length],
  ["reservations", reservations.length],
  ["allowed_emails", allowedEmails.length],
] as const) {
  console.log(`  ${t}: ${n}`);
}
const embedded = items.filter((it) => it.embedding !== null).length;
console.log(`  (임베딩 보유 물품: ${embedded}/${items.length})`);
console.log(`\n생성: server/scripts/out/d1-data.sql (${stmts.length}블록)`);
console.log("\n적용 (§9.2) — 새 D1 데이터베이스에만:");
console.log(
  "  npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/d1-data.sql",
);
