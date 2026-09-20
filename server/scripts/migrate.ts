// Neon 마이그레이션 러너 — .env의 DATABASE_URL 대상으로 migrations/*.sql 순차 실행
// 사용: deno task db:migrate
// 적용 이력은 _migrations 테이블에 파일명으로 남긴다 — 각 파일은 "첫 적용 시 딱 한 번"만
// 실행된다(기존 0001~0017은 추적 없이 매번 전체를 재실행하는 방식이었지만, 0018부터는
// 백필 후 컬럼을 지우는 등의 증분 마이그레이션이 필요해 이력 추적이 전제 조건이 됐다).
// 주의: 적용된 파일의 내용을 나중에 고쳐도 재적용되지 않는다(파일은 추가 전용).
import { neon } from '@neondatabase/serverless'

// .env 로드 (있을 때만, 실제 환경변수가 우선) — --env-file 플래그 없이 동작
try {
  const envFile = await Deno.readTextFile(new URL('../../.env', import.meta.url))
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && Deno.env.get(m[1]) === undefined) {
      Deno.env.set(m[1], m[2].replace(/^["']|["']$/g, ''))
    }
  }
} catch {
  // .env 없으면 건너뜀 — DATABASE_URL은 환경변수에서 읽음
}

const url = Deno.env.get('DATABASE_URL')
if (!url) {
  console.error('DATABASE_URL 미설정 — .env 파일(또는 환경변수)을 확인하세요')
  Deno.exit(1)
}
const sql = neon(url)

const migrationsDir = new URL('../../migrations/', import.meta.url)
const files: string[] = []
for await (const entry of Deno.readDir(migrationsDir)) {
  if (entry.isFile && entry.name.endsWith('.sql')) files.push(entry.name)
}
files.sort()

// 적용 이력 준비 — 첫 실행(이력이 비어 있을 때)에서는 0001~0017을 다시 실행해 기록한다.
// 기존 파일들은 전부 "재실행해도 안전"하게 작성돼 있어 이 전환이 무해하다.
await sql.query(
  `CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`,
  [],
)
const appliedRows = (await sql.query('SELECT name FROM _migrations', [])) as {
  name: string
}[]
const applied = new Set(appliedRows.map((r) => r.name))

for (const file of files) {
  if (applied.has(file)) continue
  const text = await Deno.readTextFile(new URL(`../../migrations/${file}`, import.meta.url))
  // 문장 단위 분할 — 세미콜론 기준 (본 프로젝트 DDL은 문자열 내 세미콜론 없음)
  const statements = text
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter(Boolean)

  // 파일 전체를 하나의 트랜잭션으로 — 도중 실패하면 롤백되어 재시도가 깨끗하다
  await sql.transaction((tx) => statements.map((stmt) => tx.query(stmt, [])))
  await sql.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
  console.log(`✓ ${file} — ${statements.length}개 문장 적용`)
}
console.log('마이그레이션 완료')
