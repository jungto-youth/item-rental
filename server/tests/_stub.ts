// 공용 Sql 스텁 — DB 없이 서비스 단위 테스트를 돌리기 위한 neon Sql 최소 모형.
// 태그드 템플릿 호출(트랜잭션 배치 구성)과 query()·transaction()만 흉내내고,
// 실제 SQL은 실행하지 않으며 각 쿼리의 텍스트·바인딩을 calls에 기록한다.
import type { Sql } from "../src/db.ts";

export type Row = Record<string, unknown>;
export type Query = { text: string; values: unknown[] };

export function stubSql(script: {
  query: (text: string, values: unknown[]) => Row[];
  transaction: (queries: Query[]) => unknown;
}) {
  const calls: Query[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Query => {
    const query = { text: strings.join("?"), values };
    calls.push(query);
    return query;
  };
  const db = Object.assign(tag, {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      return script.query(text, values);
    },
    transaction: async (queries: Query[]) => script.transaction(queries),
  });
  return { db: db as unknown as Sql, calls };
}
