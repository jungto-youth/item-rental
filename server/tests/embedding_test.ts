// 임베딩 파이프라인 테스트 — Workers AI 를 가짜 바인딩으로 대체한다.
//
// 왜 이 파일이 필요한가: embedItem 은 실패를 삼키는 방어 코드라서 다른 테스트들이
// env = {} 를 넘겨도 조용히 넘어간다. 그 결과 임베딩 텍스트 규칙
// (이름 | 설명 | 태그이름 공백 조인)이 깨져도 아무 테스트가 실패하지 않았다.
// 검색 품질이 여기서 직결되므로 AI 호출을 흉내내서 규칙을 검증한다.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { embedItem, getVectorCache, uncacheVec } from "../src/embedding.ts";
import type { Bindings } from "../src/types.ts";
import type { Sql } from "../src/db.ts";

// Workers AI 스텁 — 호출된 텍스트를 기록하고 고정 길이 벡터를 돌려준다
const DIM = 1024;
function fakeAi(calls: string[]): Bindings {
  return {
    AI: {
      run: async (_model: string, opts: { text: string[] }) => {
        calls.push(opts.text[0]);
        // 차원만 검증하면 되므로 값은 전부 1 — 코사인 유사도는 1이 된다
        return { data: [new Array(DIM).fill(1)] };
      },
    },
  } as unknown as Bindings;
}

const testsDir = fileURLToPath(new URL("./", import.meta.url).href);
const schema = ["0001_baseline.sql", "0002_item_photos_item_id.sql", "0003_member_registration_deleted.sql"]
  .map((n) => readFileSync(`${testsDir}../../migrations-d1/${n}`, "utf8"))
  .join("\n");

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  return db;
}

// node:sqlite → db.ts 와 같은 Sql 시그니처
function sqliteSql(db: DatabaseSync): Sql {
  return {
    query: async <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    batch: async <T>(stmts: { sql: string; params?: unknown[] }[]) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => db.prepare(s.sql).all(...((s.params ?? []) as never[])));
        db.exec("COMMIT");
        return out as unknown as T[][];
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function addItem(db: DatabaseSync, name: string, description: string | null = null): number {
  const r = db
    .prepare("INSERT INTO items (name, description) VALUES (?1, ?2) RETURNING id")
    .all(name, description) as { id: number }[];
  return Number(r[0].id);
}

test("임베딩 텍스트: 이름 | 설명 | 태그이름을 공백으로 이어 붙인다", async () => {
  const db = freshDb();
  const calls: string[] = [];
  const id = addItem(db, "등산 배낭 40L", "방수 포켓 포함");
  // 알파벳 역순으로 넣는다 — SQL 의 ORDER BY c.name 이 없으면 group_concat 이 삽입
  // 순서(배낭 등산)를 그대로 돌려주고 이 테스트가 실패해야 한다
  db.exec("INSERT INTO categories (id, name) VALUES (1, '배낭'), (2, '등산');");
  db.exec(
    `INSERT INTO item_categories (item_id, category_id)
     SELECT ${id}, 1 UNION ALL SELECT ${id}, 2;`,
  );

  await embedItem(fakeAi(calls), sqliteSql(db), id);

  // 태그가 이름순으로 정렬되어 공백 조인된다 (SQL 의 ORDER BY c.name 규약)
  expect(calls).toEqual(["등산 배낭 40L | 방수 포켓 포함 | 등산 배낭"]);
});

test("임베딩 텍스트: 설명이 없으면 빈 칸을 건너뛴다", async () => {
  const db = freshDb();
  const calls: string[] = [];
  const id = addItem(db, "손전등");

  await embedItem(fakeAi(calls), sqliteSql(db), id);

  // filter(Boolean) 이 빈 문자열을 걸러내므로 구분자만 남는 '손전등 | ' 이 되지 않는다
  expect(calls).toEqual(["손전등"]);
});

test("임베딩 텍스트: 태그가 설명보다 뒤에 온다 — 검색어 매칭 순서가 정해져 있다", async () => {
  const db = freshDb();
  const calls: string[] = [];
  const id = addItem(db, "빔 프로젝터", "4000ansi Lumens");
  db.exec("INSERT INTO categories (id, name) VALUES (1, '회의장비');");
  db.exec(`INSERT INTO item_categories (item_id, category_id) VALUES (${id}, 1);`);

  await embedItem(fakeAi(calls), sqliteSql(db), id);

  expect(calls[0].split(" | ")).toEqual(["빔 프로젝터", "4000ansi Lumens", "회의장비"]);
});

test("임베딩 저장: 1024차원은 4096바이트 little-endian BLOB 가 된다", async () => {
  const db = freshDb();
  const id = addItem(db, "노트북");

  await embedItem(fakeAi([]), sqliteSql(db), id);

  const row = db.prepare("SELECT embedding FROM items WHERE id = ?1").get(id) as {
    embedding: Uint8Array;
  };
  expect(row.embedding.byteLength).toBe(DIM * 4);
  // little-endian: 첫 f32 = 1.0 이면 바이트가 00 00 80 3F
  expect([...row.embedding.slice(0, 4)]).toEqual([0x00, 0x00, 0x80, 0x3f]);
});

test("임베딩 캐시: 생성 직후 getVectorCache 가 그 벡터를 담고 정규화 노름을 계산한다", async () => {
  const db = freshDb();
  const id = addItem(db, "삼각대");

  await embedItem(fakeAi([]), sqliteSql(db), id);

  const cache = await getVectorCache(sqliteSql(db));
  const entry = cache.get(id);
  expect(entry).toBeDefined();
  // 전부 1인 1024차원 벡터의 노름 = sqrt(1024) = 32
  expect(entry!.norm).toBeCloseTo(32, 5);
  uncacheVec(id);
});

test("임베딩 실패는 삼킨다 — AI 가 없어도 물품 저장은 성공해야 한다", async () => {
  // 방어 코드 확인. AI 바인딩이 없으면 예외가 나지만 embedItem 이 삼킨다
  const db = freshDb();
  const id = addItem(db, "AI 없는 환경");
  const consoleError = console.error;
  console.error = () => {};
  try {
    await expect(embedItem({} as never, sqliteSql(db), id)).resolves.toBeUndefined();
  } finally {
    console.error = consoleError;
  }
  const row = db.prepare("SELECT embedding FROM items WHERE id = ?1").get(id) as {
    embedding: unknown;
  };
  expect(row.embedding).toBeNull();
});

test("임베딩: 없는 물품이면 AI 를 아예 호출하지 않는다", async () => {
  const db = freshDb();
  const calls: string[] = [];
  await embedItem(fakeAi(calls), sqliteSql(db), 9999);
  expect(calls).toEqual([]);
});