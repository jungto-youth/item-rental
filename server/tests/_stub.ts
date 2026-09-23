// 공용 Sql 스텁 — DB 없이 서비스 단위 테스트를 돌리기 위한 D1 Sql 최소 모형.
// query()와 batch()만 흉내내고, 실제 SQL은 실행하지 않으며 각 쿼리의 텍스트·바인딩을 calls에 기록한다.
import type { Sql } from "../src/db.ts";

export type Row = Record<string, unknown>;
// db.batch() 문장 — 서비스가 넘기는 D1 형태 그대로
export type Query = { sql: string; params?: unknown[] };
// query() 호출 기록 — (text, values) 인자 형태
export type Call = { text: string; values: unknown[] };

export function stubSql(script: {
  query: (text: string, values: unknown[]) => Row[];
  batch: (stmts: Query[]) => unknown;
}) {
  const calls: Call[] = [];
  const db = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return script.query(text, values);
    },
    batch: async (stmts: Query[]) => script.batch(stmts),
  };
  return { db: db as unknown as Sql, calls };
}
