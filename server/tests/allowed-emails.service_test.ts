// 허용 이메일 서비스 단위 테스트 — DB 없이 돌아간다 (Sql 스텁)
/// <reference types="@cloudflare/workers-types" />
import { test, expect } from "vitest";
import {
  addAllowedEmail,
  deleteAllowedEmail,
  listAllowedEmails,
  normalizeEmail,
} from "../src/services/allowed-emails.service.ts";
import type { Sql } from "../src/db.ts";

type Row = Record<string, unknown>;
type Query = { text: string; values: unknown[] };

// neon Sql의 최소 스텁 — query() 의 텍스트·바인딩을 기록하고 스크립트된 행을 돌려준다
function stubSql(script: {
  query: (text: string, values: unknown[]) => Row[];
}) {
  const calls: Query[] = [];
  const db = Object.assign(
    (_strings: TemplateStringsArray) => {
      throw new Error("이 서비스는 query()만 쓴다");
    },
    {
      query: async (text: string, values: unknown[] = []) => {
        calls.push({ text, values });
        return script.query(text, values);
      },
    },
  );
  return { db: db as unknown as Sql, calls };
}

test("normalizeEmail: 대문자와 앞뒤 공백을 정규화한다", () => {
  expect(normalizeEmail("  Admin@Example.COM ")).toEqual("admin@example.com");
});

test("addAllowedEmail: 정규화된 이메일과 메모·등록자를 바인딩한다", async () => {
  const { db, calls } = stubSql({ query: () => [{ id: "uuid-1" }] });

  const result = await addAllowedEmail(db, "  Admin@Example.COM ", {
    note: " 운영진 개인 ",
    createdBy: "boss@jungto.org",
  });

  expect(result).toEqual({ ok: true });
  expect(
    calls[0].values,
  ).toEqual(
    [
      "admin@example.com",
      "운영진 개인",
      "boss@jungto.org",
    ],
  );
});

test("addAllowedEmail: INSERT가 0행이면 duplicate 을 돌려준다 (409)", async () => {
  const { db } = stubSql({ query: () => [] });

  const result = await addAllowedEmail(db, "already@listed.com");

  expect(result).toEqual({ error: "duplicate" });
});

test("deleteAllowedEmail: 1행이면 성공", async () => {
  const { db } = stubSql({ query: () => [{ id: "uuid-1" }] });

  const result = await deleteAllowedEmail(db, "uuid-1");

  expect(result).toEqual({ ok: true });
});

test("deleteAllowedEmail: 0행이면 not_found (404)", async () => {
  const { db } = stubSql({ query: () => [] });

  const result = await deleteAllowedEmail(db, "missing-id");

  expect(result).toEqual({ error: "not_found" });
});

test("listAllowedEmails: 최근 등록순 SELECT 를 발행한다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: "uuid-1", email: "a@b.com" }],
  });

  const rows = await listAllowedEmails(db);

  expect(rows.length).toEqual(1);
  expect(calls[0].text.includes("ORDER BY created_at DESC")).toBe(true);
});
