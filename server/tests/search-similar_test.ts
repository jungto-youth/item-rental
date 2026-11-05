// 검색 '비슷한 물품' 표시 — 키워드로 맞는 물품이 없고 의미 후보만 남으면 similar 를 내린다.
//
// bge-m3 유사도는 절대 임계로 무관한 결과를 거를 수 없어, 없는 물품을 검색해도 의미 후보가
// 정답처럼 나왔다. 결과를 지우는 대신 응답이 그 사실을 알려 화면이 안내하게 한다.
import { test, expect } from "vitest";
import { httpFixture } from "./_http.fixture.ts";

// 3차원 단위 벡터 — 의미 후보가 되도록 질의 벡터와 같은 방향으로 둔다
function vecBlob(v: number[]): Uint8Array {
  const out = new Uint8Array(v.length * 4);
  const dv = new DataView(out.buffer);
  v.forEach((x, i) => dv.setFloat32(i * 4, x, true));
  return out;
}

async function setup() {
  const fixture = httpFixture();
  const { db, env } = fixture;
  const insert = db.prepare("INSERT INTO items (id, name, embedding) VALUES (?1, ?2, ?3)");
  insert.run(1, "텐트", vecBlob([1, 0, 0]));
  insert.run(2, "접이식 의자", vecBlob([0.9, 0.1, 0]));
  (env as unknown as { AI: unknown }).AI = { run: async () => ({ data: [[1, 0, 0]] }) };
  const cookie = await fixture.member("user");
  const search = async (q: string) =>
    (await (await fixture.request(`/api/items?q=${encodeURIComponent(q)}`, { headers: { cookie } })).json()) as {
      items: { id: number }[];
      similar: boolean;
    };
  return { ...fixture, search };
}

test("검색: 키워드로 맞는 물품이 있으면 similar 는 false", async () => {
  const { db, search } = await setup();
  try {
    const res = await search("텐트");
    expect(res.items[0].id).toBe(1);
    expect(res.similar).toBe(false);
  } finally { db.close(); }
});

test("검색: 키워드로 맞는 물품이 없고 의미 후보만 있으면 similar 는 true", async () => {
  const { db, search } = await setup();
  try {
    const res = await search("캠핑장비");
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.similar).toBe(true);
  } finally { db.close(); }
});

test("검색: 결과가 없으면 similar 는 false", async () => {
  const { db, env, search } = await setup();
  try {
    (env as unknown as { AI: unknown }).AI = { run: async () => { throw new Error("AI 장애"); } };
    const res = await search("캠핑장비없음");
    expect(res).toEqual({ items: [], similar: false });
  } finally { db.close(); }
});
