// Neon 마이그레이션 러너 — .env의 DATABASE_URL 대상으로 migrations/*.sql 순차 실행
// 사용: deno task db:migrate
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

for (const file of files) {
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

  for (const stmt of statements) {
    await sql.query(stmt, [])
  }
  console.log(`✓ ${file} — ${statements.length}개 문장 적용`)
}
console.log('마이그레이션 완료')
