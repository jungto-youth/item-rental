// 문의 서비스 단위 테스트 — DB 없이 Sql 스텁.
// 회귀 대상: 타인 문의 숨김(소유권 조건), 답변 상태 전이, 물품 연결 검증.
import { test, expect } from "vitest";
import {
  answerInquiry,
  createInquiry,
  getInquiryForViewer,
  listInquiriesForAdmin,
  listMyInquiries,
} from "../src/services/inquiries.service.ts";
import { stubSql } from "./_stub.ts";

test("createInquiry: 일반 문의는 INSERT 만 하고 id 를 돌려준다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 7 }],
    batch: () => [],
  });

  const result = await createInquiry(db, {
    memberId: "m1",
    title: "대여 기간 문의",
    body: "연장할 수 있나요?",
    itemId: null,
  });

  expect(result).toEqual({ ok: true, id: 7, itemName: null });
  expect(calls).toHaveLength(1);
  expect(calls[0].text).toMatch(/INSERT INTO inquiries/);
  expect(calls[0].text).toMatch(/RETURNING id/);
  expect(calls[0].values).toEqual(["m1", null, "대여 기간 문의", "연장할 수 있나요?"]);
});

test("createInquiry: 물품이 연결되면 활성 물품을 확인하고 이름을 돌려준다", async () => {
  const { db, calls } = stubSql({
    query: (text) =>
      /SELECT name FROM items/.test(text) ? [{ name: "등산 배낭" }] : [{ id: 8 }],
    batch: () => [],
  });

  const result = await createInquiry(db, {
    memberId: "m1",
    title: "배낭 문의",
    body: "세탁해서 빌릴 수 있나요?",
    itemId: 42,
  });

  expect(result).toEqual({ ok: true, id: 8, itemName: "등산 배낭" });
  expect(calls[0].text).toMatch(/lifecycle = 'active'/);
  expect(calls[0].values).toEqual([42]);
  expect(calls[1].values).toEqual(["m1", 42, "배낭 문의", "세탁해서 빌릴 수 있나요?"]);
});

test("createInquiry: 없거나 폐기된 물품은 bad_item", async () => {
  const { db, calls } = stubSql({
    query: () => [],
    batch: () => [],
  });

  const result = await createInquiry(db, {
    memberId: "m1",
    title: "배낭 문의",
    body: "빌릴 수 있나요?",
    itemId: 999,
  });

  expect(result).toEqual({ error: "bad_item" });
  // 물품 확인에서 끝나고 INSERT 는 발행하지 않는다
  expect(calls).toHaveLength(1);
});

test("listMyInquiries: 작성자 조건과 최신순으로 본문 없이 조회한다", async () => {
  const { db, calls } = stubSql({
    query: () => [
      {
        id: 1,
        title: "문의",
        status: "open",
        item_id: null,
        item_name: null,
        created_at: "2026-11-24T00:00:00.000Z",
        answered_at: null,
      },
    ],
    batch: () => [],
  });

  const rows = await listMyInquiries(db, "m1");

  expect(rows).toHaveLength(1);
  expect(calls[0].text).toMatch(/WHERE q\.member_id = \?1/);
  expect(calls[0].text).toMatch(/ORDER BY q\.created_at DESC/);
  expect(calls[0].text).not.toMatch(/q\.body/);
  expect(calls[0].values).toEqual(["m1"]);
});

test("getInquiryForViewer: 작성자 또는 관리자만 통과하는 조건을 SQL 에 넣는다", async () => {
  const { db, calls } = stubSql({
    query: () => [],
    batch: () => [],
  });

  expect(await getInquiryForViewer(db, 5, "m1", false)).toBeNull();
  expect(calls[0].text).toMatch(/q\.member_id = \?2 OR \?3 = 1/);
  expect(calls[0].values).toEqual([5, "m1", 0]);

  await getInquiryForViewer(db, 5, "admin", true);
  expect(calls[1].values).toEqual([5, "admin", 1]);
});

test("listInquiriesForAdmin: 답변 대기 우선 정렬과 회원·답변자 join 을 쓴다", async () => {
  const { db, calls } = stubSql({
    query: () => [],
    batch: () => [],
  });

  await listInquiriesForAdmin(db);

  expect(calls[0].text).toMatch(/JOIN members m ON m\.id = q\.member_id/);
  expect(calls[0].text).toMatch(/LEFT JOIN members a ON a\.id = q\.answered_by/);
  expect(calls[0].text).toMatch(/CASE q\.status WHEN 'open' THEN 0 ELSE 1 END/);
});

test("answerInquiry: 상태·답변·답변자·시각을 한 문장으로 갱신한다", async () => {
  const { db, calls } = stubSql({
    query: () => [{ id: 5 }],
    batch: () => [],
  });

  expect(await answerInquiry(db, 5, "가능합니다", "admin")).toEqual({ ok: true });
  expect(calls[0].text).toMatch(/SET status = 'answered'/);
  expect(calls[0].text).toMatch(/answer = \?2/);
  expect(calls[0].text).toMatch(/answered_by = \?3/);
  expect(calls[0].text).toMatch(/answered_at = strftime/);
  expect(calls[0].text).toMatch(/WHERE id = \?1/);
  expect(calls[0].values).toEqual([5, "가능합니다", "admin"]);
});

test("answerInquiry: 0행이면 not_found", async () => {
  const { db } = stubSql({
    query: () => [],
    batch: () => [],
  });

  expect(await answerInquiry(db, 5, "가능합니다", "admin")).toEqual({
    error: "not_found",
  });
});
