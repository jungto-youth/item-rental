// 의미 검색 임베딩 백필 — Workers AI bge-m3 (1024차원)
//
// 왜 필요한가: 임베딩은 등록/수정 API 경로에서만 만들어진다. import-items.ts처럼
// DB에 직접 INSERT/UPDATE 하는 일괄 반영분은 임베딩이 NULL로 남고, 목록 라우트의
// 의미 검색이 `embedding IS NOT NULL`로 거르므로 그 물품들은 의미 검색에서 조용히
// 빠진다(키워드 검색은 계속 동작). 일괄 반영 후 이 스크립트를 한 번 돌린다.
//
// 사용:
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... deno task db:reembed
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... deno task db:reembed --all
//
// 모델은 반드시 서버(embedding.ts)와 같아야 한다 — 다른 모델의 벡터를 같은 컬럼에
// 섞으면 코사인 거리가 의미를 잃어 검색 순위가 조용히 망가진다.
import { neon } from "@neondatabase/serverless";
import { itemEmbedText } from "../src/embedding.ts";

// .env 로드 (있을 때만, 실제 환경변수가 우선) — migrate.ts와 같은 방식
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

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  console.error("DATABASE_URL 미설정 — .env 파일(또는 환경변수)을 확인하세요");
  Deno.exit(1);
}

const ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
const API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");
if (!ACCOUNT_ID || !API_TOKEN) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID 와 CLOUDFLARE_API_TOKEN 이 필요합니다.\n" +
      "  계정 ID: npx wrangler whoami\n" +
      "  API 토큰: Workers AI 권한이 있는 토큰 (wrangler 로그인 토큰으로도 동작)",
  );
  Deno.exit(1);
}

const MODEL = "@cf/baai/bge-m3";
const BATCH = 20; // 한 요청에 담을 텍스트 수 — 154건 규모에서 왕복을 8회 이하로 줄인다

const all = Deno.args.includes("--all");
const sql = neon(DATABASE_URL);

type Row = { id: number; name: string; description: string | null };

const targets = (await sql`
  SELECT id, name, description FROM items
  WHERE status <> 'retired' AND (embedding IS NULL OR ${all})
  ORDER BY id
`) as Row[];

if (targets.length === 0) {
  console.log("백필할 물품이 없습니다 — 모든 물품에 임베딩이 있습니다.");
  Deno.exit(0);
}
console.log(
  `임베딩 대상 ${targets.length}건 (${all ? "전체" : "임베딩 없는 것만"})`,
);

// bge-m3 호출 — 서버의 embed()와 같은 응답 형태(data 또는 predictions)를 받는다
async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    },
  );
  const body = (await res.json()) as {
    success?: boolean;
    errors?: { message?: string }[];
    result?: { data?: number[][]; predictions?: number[][] };
    data?: number[][];
    predictions?: number[][];
  };
  if (!res.ok) {
    throw new Error(
      `Workers AI ${res.status}: ${body.errors?.map((e) => e.message).join(", ") ?? JSON.stringify(body)}`,
    );
  }
  const vecs =
    body.result?.data ??
    body.result?.predictions ??
    body.data ??
    body.predictions;
  if (!vecs || vecs.length !== texts.length) {
    throw new Error(
      `임베딩 응답 형식 예상 외 (요청 ${texts.length}건, 응답 ${vecs?.length ?? 0}건)`,
    );
  }
  return vecs;
}

let done = 0;
for (let i = 0; i < targets.length; i += BATCH) {
  const chunk = targets.slice(i, i + BATCH);
  const texts = chunk.map((r) => itemEmbedText(r.name, r.description));
  const vecs = await embedBatch(texts);

  // 건별 UPDATE — 실패한 건만 다음 실행에서 다시 잡히도록 개별 문장으로 둔다
  for (let j = 0; j < chunk.length; j++) {
    const vec = `[${vecs[j].join(",")}]`;
    await sql`UPDATE items SET embedding = ${vec}::vector WHERE id = ${chunk[j].id}`;
    done++;
  }
  console.log(`  ${done}/${targets.length} …`);
}

// 사후 검증 — NULL이 남아 있으면 실패로 종료 (CI/스크립트 체이닝에서 잡히도록)
const remaining = (
  await sql`SELECT COUNT(*)::int AS c FROM items WHERE status <> 'retired' AND embedding IS NULL`
)[0].c as number;
console.log(`완료 — ${done}건 갱신, 임베딩 없는 물품 ${remaining}건 남음`);
if (remaining > 0) Deno.exit(1);
