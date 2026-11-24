// 문의 라우트 — 실제 HTTP 호출로 경로·권한·응답 모양을 고정한다.
// 서비스 단위 테스트가 SQL 을 보고, 여기서는 라우트가 그 서비스를 올바르게 감싸는지 본다.
import { test, expect } from "vitest";
import { httpFixture, TEST_ORIGIN } from "./_http.fixture.ts";

const json = { origin: TEST_ORIGIN, "content-type": "application/json" };
const get = { origin: TEST_ORIGIN };

test("문의: 작성 → 내 목록 → 상세, 타인은 404", async () => {
  const { db, request, member } = httpFixture();
  try {
    const user = await member("m1");
    const other = await member("m2");
    const admin = await member("admin", "admin");
    const item = db
      .prepare("INSERT INTO items (name) VALUES (?1) RETURNING id")
      .all("등산 배낭")[0] as { id: number };

    const created = await request("/api/inquiries", {
      method: "POST",
      headers: { cookie: user, ...json },
      body: JSON.stringify({
        title: "  이번 주말에 빌릴 수 있나요?  ",
        body: "  토요일 오전에 필요합니다.  ",
        item_id: item.id,
      }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };

    const mine = await request("/api/inquiries/mine", {
      headers: { cookie: user, ...get },
    });
    expect(mine.status).toBe(200);
    const mineBody = (await mine.json()) as {
      inquiries: { id: number; title: string; item_name: string | null; status: string }[];
    };
    expect(mineBody.inquiries).toHaveLength(1);
    expect(mineBody.inquiries[0]).toMatchObject({
      id,
      title: "이번 주말에 빌릴 수 있나요?",
      item_name: "등산 배낭",
      status: "open",
    });

    const detail = await request(`/api/inquiries/${id}`, {
      headers: { cookie: user, ...get },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      inquiry: { body: string; answer: string | null; status: string };
    };
    expect(detailBody.inquiry.body).toBe("토요일 오전에 필요합니다.");
    expect(detailBody.inquiry.answer).toBeNull();

    // 작성자가 아니면 존재 여부를 알려주지 않는다
    const hidden = await request(`/api/inquiries/${id}`, {
      headers: { cookie: other, ...get },
    });
    expect(hidden.status).toBe(404);

    // 관리자는 볼 수 있다
    const adminView = await request(`/api/inquiries/${id}`, {
      headers: { cookie: admin, ...get },
    });
    expect(adminView.status).toBe(200);
  } finally {
    db.close();
  }
});

test("문의: 관리자 목록·답변, 답변 후 회원 화면에 반영된다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const user = await member("m1");
    const admin = await member("admin", "admin");

    const created = await request("/api/inquiries", {
      method: "POST",
      headers: { cookie: user, ...json },
      body: JSON.stringify({
        title: "대여 기간 문의",
        body: "연장할 수 있나요?",
      }),
    });
    const { id } = (await created.json()) as { id: number };

    const list = await request("/api/admin/inquiries", {
      headers: { cookie: admin, ...get },
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      inquiries: {
        id: number;
        member_name: string;
        member_phone: string | null;
        answered_by_name: string | null;
      }[];
    };
    expect(listBody.inquiries[0]).toMatchObject({
      id,
      member_name: "m1",
      member_phone: "010-0000-0000",
      answered_by_name: null,
    });

    const answered = await request(`/api/admin/inquiries/${id}/answer`, {
      method: "PUT",
      headers: { cookie: admin, ...json },
      body: JSON.stringify({ answer: "  이번 주말에는 가능합니다.  " }),
    });
    expect(answered.status).toBe(200);

    const detail = await request(`/api/inquiries/${id}`, {
      headers: { cookie: user, ...get },
    });
    const detailBody = (await detail.json()) as {
      inquiry: { status: string; answer: string | null; answered_at: string | null };
    };
    expect(detailBody.inquiry.status).toBe("answered");
    expect(detailBody.inquiry.answer).toBe("이번 주말에는 가능합니다.");
    expect(detailBody.inquiry.answered_at).toBeTruthy();

    // 일반 회원은 관리자 API 에 접근할 수 없다
    const forbidden = await request("/api/admin/inquiries", {
      headers: { cookie: user, ...get },
    });
    expect(forbidden.status).toBe(403);
  } finally {
    db.close();
  }
});

test("문의: 제목·본문·물품 검증과 비로그인 401", async () => {
  const { db, request, member } = httpFixture();
  try {
    const user = await member("m1");

    const anonymous = await request("/api/inquiries", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ title: "x", body: "y" }),
    });
    expect(anonymous.status).toBe(401);

    const cases: { body: unknown; error: string }[] = [
      { body: { title: "   ", body: "내용" }, error: "bad_title" },
      { body: { title: "가".repeat(101), body: "내용" }, error: "bad_title" },
      { body: { title: "제목", body: "   " }, error: "bad_body" },
      { body: { title: "제목", body: "가".repeat(2001) }, error: "bad_body" },
      { body: { title: "제목", body: "내용", item_id: 0 }, error: "bad_item" },
      { body: { title: "제목", body: "내용", item_id: 999 }, error: "bad_item" },
    ];

    for (const item of cases) {
      const res = await request("/api/inquiries", {
        method: "POST",
        headers: { cookie: user, ...json },
        body: JSON.stringify(item.body),
      });
      expect(res.status, JSON.stringify(item.body)).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(item.error);
    }
  } finally {
    db.close();
  }
});
