// 예시 데이터 시드 — deno task db:seed
// 멱등: 물품 이름 중복 시 건너뜀 → 몇 번 돌려도 안전
import { neon } from '@neondatabase/serverless'

// .env 로드 (migrate.ts와 동일 패턴 — 실제 환경변수가 우선)
try {
  const envFile = await Deno.readTextFile(new URL('../../.env', import.meta.url))
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && Deno.env.get(m[1]) === undefined) {
      Deno.env.set(m[1], m[2].replace(/^["']|["']$/g, ''))
    }
  }
} catch {
  // .env 없으면 건너뜀
}

const url = Deno.env.get('DATABASE_URL')
if (!url) {
  console.error('DATABASE_URL 미설정 — .env 파일(또는 환경변수)을 확인하세요')
  Deno.exit(1)
}
// 기본값은 로컬·프로덕션이 같은 DB 를 가리킨다 — 시드는 데이터를 바꾸므로
// 대상 호스트를 먼저 보여주고 --confirm 플래그로 명시적 승인을 받는다
let targetHost = 'unknown'
try {
  targetHost = new URL(url).host
} catch {
  // 파싱 실패 시 그대로 진행 — neon() 이 오류를 낸다
}
if (!Deno.args.includes('--confirm')) {
  console.error(`이 스크립트는 DB 에 데이터를 씁니다. 대상: ${targetHost}`)
  console.error('진행하려면 --confirm 플래그를 붙여 실행하세요: deno task db:seed -- --confirm')
  Deno.exit(1)
}
console.log(`DB 대상: ${targetHost}`)
const sql = neon(url)

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

// 멱등 — 이미 있는 물품은 건너뜀
const existing = (await sql.query('SELECT name FROM items')) as { name: string }[]
const have = new Set(existing.map((r) => r.name))

let added = 0
for (const it of ITEMS) {
  if (have.has(it.name)) {
    console.log(`· ${it.name} — 이미 있음, 건너뜀`)
    continue
  }
  await sql.query(
    `INSERT INTO items (name, description, total_qty) VALUES ($1, $2, $3)`,
    [it.name, it.description, it.total_qty],
  )
  added++
  console.log(`✓ ${it.name}`)
}

console.log(`시드 완료 — 물품 ${added}개 추가`)
