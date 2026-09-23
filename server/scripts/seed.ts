// 예시 데이터 시드 — deno task db:seed (PLAN §8)
// 워커 밖 스크립트는 D1에 직접 연결할 수 없으므로 INSERT SQL을 생성하고
// wrangler d1 execute 로 적용한다:
//   deno task db:seed                                                    # out/seed.sql 생성
//   npx wrangler d1 execute item-rental-db --local  --file=server/scripts/out/seed.sql
//   npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/seed.sql
//
// 멱등: 같은 이름의 물품이 있으면 INSERT를 건너뛴다(NOT EXISTS) — 파일을 몇 번 적용해도 안전.
// FTS: items_fts(rowid = items.id)에 검색 텍스트를 함께 넣는다(PLAN §7.3) — 기존 물품 중
//      FTS 행이 없는 것도 여기서 같이 채워진다(가드가 중복을 막는다).

// --- 예시 물품 (v2.5 — 카테고리 없음, 탐색은 검색으로) ---
const ITEMS = [
  { name: '원터치 텐트 (3~4인)', description: '페그·폴대 포함. 반납 전 흙을 털어 주세요.', total_qty: 2 },
  { name: '취사용품 세트 (코펠)', description: '2~3인용 코펠 + 버너. 가스는 지부에서 제공하지 않아요.', total_qty: 3 },
  { name: 'LED 랜턴', description: '건전지는 미포함이에요.', total_qty: 5 },
  { name: '침낭 (봄·가을용)', description: '내용물은 세탁하지 말고 통풍 건조 후 반납해 주세요.', total_qty: 4 },
  { name: '접이식 테이블', description: '4~6인용 접이식 테이블.', total_qty: 2 },
  { name: '블루투스 스피커', description: '충전기 포함. 충전 상태로 반납해 주세요.', total_qty: 2 },
  { name: '캐노피 (3x3m)', description: '가방·페그 포함. 강풍 시 사용을 피해 주세요.', total_qty: 1 },
  { name: '대형 돗자리 (10인용)', description: '행사·피크닉용 대형 돗자리.', total_qty: 2 },
  { name: '확성기 (마이크 포함)', description: '충전식. 사용 후 충전해 반납해 주세요.', total_qty: 1 },
  { name: '멀티탭 (5구)', description: '야외 행사용 멀티탭.', total_qty: 3 },
  { name: '배드민턴 세트', description: '라켓 4개 + 셔틀콕. 네트는 미포함이에요.', total_qty: 2 },
  { name: '족구공·풋살공', description: '공기가 빠졌으면 펌프는 지부 비품실에 있어요.', total_qty: 3 },
  { name: '줄넘기', description: '개인 운동용.', total_qty: 4 },
  { name: '대용량 전기포트', description: '정기 모임 차 준비용.', total_qty: 1 },
  { name: '접이식 운반 카트', description: '물품 나를 때 사용하는 접이식 카트.', total_qty: 2 },
]

// SQL 문자열 리터럴 — ' 를 '' 로 이중화
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

const stmts: string[] = []
for (const it of ITEMS) {
  stmts.push(
    `INSERT INTO items (name, description, total_qty)\n` +
      `SELECT ${q(it.name)}, ${q(it.description)}, ${it.total_qty}\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = ${q(it.name)});`,
  )
  // INSERT가 0행(이미 있음)이어도 FTS 행이 없으면 채운다 — 가드가 멱등성을 보장
  stmts.push(
    `INSERT INTO items_fts (rowid, name, description, location, tags)\n` +
      `SELECT i.id, i.name, COALESCE(i.description, ''), COALESCE(i.location, ''), ''\n` +
      `FROM items i WHERE i.name = ${q(it.name)}\n` +
      `  AND NOT EXISTS (SELECT 1 FROM items_fts WHERE rowid = i.id);`,
  )
}

const outDir = new URL('./out/', import.meta.url)
await Deno.mkdir(outDir, { recursive: true })
const out = new URL('./out/seed.sql', import.meta.url)
await Deno.writeTextFile(
  out,
  `-- 시드 데이터 (deno task db:seed 생성) — 재적용 멱등\n\n` +
    stmts.join('\n') +
    '\n',
)

console.log(`생성: server/scripts/out/seed.sql — 물품 ${ITEMS.length}종 (멱등 가드 포함, FTS 동기화 포함)`)
console.log('\n적용:')
console.log('  npx wrangler d1 execute item-rental-db --local  --file=server/scripts/out/seed.sql')
console.log('  npx wrangler d1 execute item-rental-db --remote --file=server/scripts/out/seed.sql')
