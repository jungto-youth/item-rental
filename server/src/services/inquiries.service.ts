// 문의(Inquiry) 도메인 서비스 — 작성·목록·상세·답변 SQL 을 직접 소유.
//
// 문의 본문은 작성자와 관리자만 볼 수 있다. 타인 문의는 존재 여부를 알려주지 않도록
// 404 로 숨긴다(대여 상세와 같은 규칙). 답변은 상태·답변자·시각을 한 문장으로 갱신한다.
import { SQL_NOW, type Sql } from "../db";
import type {
  AdminInquiry,
  Inquiry,
  InquirySummary,
} from "../../../shared/api-types";

export type CreateInquiryInput = {
  memberId: string;
  title: string;
  body: string;
  itemId: number | null;
};

export type CreateInquiryResult =
  | { ok: true; id: number; itemName: string | null }
  | { error: "bad_item" };

// 물품이 연결된 문의만 활성 물품인지 확인한다. 일반 문의(itemId=null)는 그대로 저장한다.
export async function createInquiry(
  db: Sql,
  input: CreateInquiryInput,
): Promise<CreateInquiryResult> {
  let itemName: string | null = null;

  if (input.itemId !== null) {
    const [item] = await db.query<{ name: string }>(
      `SELECT name FROM items WHERE id = ?1 AND lifecycle = 'active'`,
      [input.itemId],
    );
    if (!item) return { error: "bad_item" };
    itemName = item.name;
  }

  const rows = await db.query<{ id: number }>(
    `INSERT INTO inquiries (member_id, item_id, title, body)
     VALUES (?1, ?2, ?3, ?4)
     RETURNING id`,
    [input.memberId, input.itemId, input.title, input.body],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("inquiries: INSERT did not return an id");
  return { ok: true, id, itemName };
}

// 내 문의 — 본문은 빼고 최신순으로 내린다.
export async function listMyInquiries(
  db: Sql,
  memberId: string,
): Promise<InquirySummary[]> {
  return db.query<InquirySummary>(
    `SELECT q.id, q.title, q.status, q.item_id, i.name AS item_name,
            q.created_at, q.answered_at
       FROM inquiries q
       LEFT JOIN items i ON i.id = q.item_id
      WHERE q.member_id = ?1
      ORDER BY q.created_at DESC`,
    [memberId],
  );
}

// 상세 — 작성자 또는 관리자만. 0행이면 호출자가 404 로 숨긴다.
export async function getInquiryForViewer(
  db: Sql,
  id: number,
  viewerId: string,
  isAdmin: boolean,
): Promise<Inquiry | null> {
  const [row] = await db.query<Inquiry>(
    `SELECT q.id, q.title, q.body, q.status, q.item_id, i.name AS item_name,
            q.created_at, q.answered_at, q.answer
       FROM inquiries q
       LEFT JOIN items i ON i.id = q.item_id
      WHERE q.id = ?1 AND (q.member_id = ?2 OR ?3 = 1)`,
    [id, viewerId, isAdmin ? 1 : 0],
  );
  return row ?? null;
}

// 관리자 목록 — 답변 대기 먼저, 그 안에서 최신순.
export async function listInquiriesForAdmin(
  db: Sql,
): Promise<AdminInquiry[]> {
  return db.query<AdminInquiry>(
    `SELECT q.id, q.title, q.body, q.status, q.item_id, i.name AS item_name,
            q.created_at, q.answered_at, q.answer,
            q.member_id, m.name AS member_name, m.email AS member_email,
            m.phone AS member_phone, a.name AS answered_by_name
       FROM inquiries q
       JOIN members m ON m.id = q.member_id
       LEFT JOIN items i ON i.id = q.item_id
       LEFT JOIN members a ON a.id = q.answered_by
      ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END,
               q.created_at DESC`,
  );
}

// 답변 등록·수정 — 기존 답변이 있어도 덮어쓴다. 0행이면 문의 없음.
export async function answerInquiry(
  db: Sql,
  id: number,
  answer: string,
  adminId: string,
): Promise<{ ok: true } | { error: "not_found" }> {
  const rows = await db.query<{ id: number }>(
    `UPDATE inquiries
        SET status = 'answered',
            answer = ?2,
            answered_by = ?3,
            answered_at = ${SQL_NOW},
            updated_at = ${SQL_NOW}
      WHERE id = ?1
      RETURNING id`,
    [id, answer, adminId],
  );
  return rows.length > 0 ? { ok: true } : { error: "not_found" };
}
