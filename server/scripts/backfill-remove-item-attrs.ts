// size/color 백필 + size/color/note 삭제 전 기록 남기기 — 일회성 스크립트
// 실행: deno task db:migrate **전에** 한 번만 실행 (migrate 이 0016에서 컬럼을 지운다)
//
// · size/color 값 → 공개 description 에 '규격: … / 색상: …' 형태로 보존
//   (두 필드가 '정보 표시용'이었으므로 사용자 노출 설명으로 합치는 게 맞다)
// · note 는 관리자 전용(구입처·시리얼)이므로 description 에 합치지 **않는다** —
//   사용자 결정(완전 제거). 대신 아래 출력에 값 전체를 찍어 삭제 전 기록으로 남긴다.
//
// 멱등 보호: description 에 이미 '규격:' 이 있으면 다시 붙이지 않는다.
import { neon } from '@neondatabase/serverless'

// .env 로드 (seed.ts와 동일 패턴 — 실제 환경변수가 우선)
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
const sql = neon(url)

interface Row {
  id: number
  name: string
  description: string | null
  size: string | null
  color: string | null
  note: string | null
}

const rows = (await sql.query(
  `SELECT id, name, description, size, color, note
   FROM items
   WHERE (size IS NOT NULL AND size <> '')
      OR (color IS NOT NULL AND color <> '')
      OR (note IS NOT NULL AND note <> '')`,
)) as Row[]

if (rows.length === 0) {
  console.log('백필 대상 없음 — size/color/note 모두 비어 있음')
  Deno.exit(0)
}

console.log(`백필 대상 ${rows.length}건 — 0016 마이그레이션 전 백필을 시작합니다\n`)
console.log('── 삭제될 note(관리자 메모) 기록 ──')
for (const r of rows) {
  if (r.note) console.log(`#${r.id} ${r.name}: ${r.note}`)
}

let updated = 0
console.log('\n── size/color → description 백필 ──')
for (const r of rows) {
  const parts: string[] = []
  if (r.size) parts.push(`규격: ${r.size}`)
  if (r.color) parts.push(`색상: ${r.color}`)
  if (parts.length === 0) continue
  if (r.description?.includes('규격:')) continue // 멱등 보호 — 이미 백필된 행은 건너뜀

  const suffix = parts.join(' / ')
  const next = r.description?.trim()
    ? `${r.description.trim()} (${suffix})`
    : suffix
  await sql.query('UPDATE items SET description = $1 WHERE id = $2', [next, r.id])
  updated++
  console.log(`#${r.id} ${r.name}: "${r.description ?? ''}" → "${next}"`)
}

console.log(`\n완료 — ${updated}건 백필. 이제 'deno task db:migrate' 를 실행해 컬럼을 제거하세요.`)