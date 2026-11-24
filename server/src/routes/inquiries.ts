import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { runInBackground } from "../background";
import { getDb, type Sql } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  createInquiry,
  getInquiryForViewer,
  listMyInquiries,
} from "../services/inquiries.service";
import {
  isTelegramConfigured,
  notifyInquiryCreated,
} from "../services/telegram.service";

// 문의 — 로그인 회원 전용. 작성·내 목록·상세.
const TITLE_MAX = 100;
const BODY_MAX = 2_000;

export const inquiriesRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

inquiriesRoute.use("*", requireAuth);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// 작성 — 제목·본문은 trim 후 길이를 검사한다. item_id 는 선택.
inquiriesRoute.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const title = text(body.title);
  if (!title || title.length > TITLE_MAX) {
    return c.json({ error: "bad_title" }, 400);
  }

  const content = text(body.body);
  if (!content || content.length > BODY_MAX) {
    return c.json({ error: "bad_body" }, 400);
  }

  let itemId: number | null = null;
  if (body.item_id !== undefined && body.item_id !== null) {
    itemId = positiveInt(body.item_id);
    if (itemId === null) return c.json({ error: "bad_item" }, 400);
  }

  const db: Sql = getDb(c.env);
  const result = await createInquiry(db, {
    memberId: user.id,
    title,
    body: content,
    itemId,
  });
  if ("error" in result) return c.json({ error: result.error }, 400);

  // 알림은 저장 성공 뒤 백그라운드로 — 전송 실패가 접수를 막지 않는다.
  if (isTelegramConfigured(c.env)) {
    runInBackground(c, () =>
      notifyInquiryCreated(c.env, {
        title,
        itemName: result.itemName,
        memberName: user.name,
        memberPhone: user.phone,
      }),
    );
  }

  return c.json({ id: result.id }, 201);
});

// 내 문의 목록 — /mine 을 /:id 보다 먼저 등록한다.
inquiriesRoute.get("/mine", async (c) => {
  const db: Sql = getDb(c.env);
  const inquiries = await listMyInquiries(db, c.get("user")!.id);
  return c.json({ inquiries });
});

// 상세 — 작성자 또는 관리자. 타인 문의는 404 로 숨긴다.
inquiriesRoute.get("/:id", async (c) => {
  const id = positiveInt(c.req.param("id"));
  if (id === null) return c.json({ error: "bad_id" }, 400);

  const user = c.get("user")!;
  const db: Sql = getDb(c.env);
  const inquiry = await getInquiryForViewer(
    db,
    id,
    user.id,
    user.role === "admin",
  );
  if (!inquiry) return c.json({ error: "not_found" }, 404);
  return c.json({ inquiry });
});
