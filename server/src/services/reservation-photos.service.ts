// 반납 사진 서비스 — 예약별 상태 사진의 SQL·R2 쓰기를 소유한다.
//
// 반납 사진은 물품 카탈로그 사진(item_photos)과 별개다. 회원은 본인이 대여 중인
// 건에만, 관리자는 임의의 대여 중 건에 올릴 수 있다. 반납 완료 후에는 이력의
// 증빙이므로 회원이 지우지 못한다(관리자는 정정할 수 있다).
import type { Sql } from "../db";
import type { Bindings } from "../types";
import { MAX_RETURN_PHOTOS } from "../../../shared/photo-limits";

export type ReturnPhotoActor = {
  id: string;
  role: "member" | "admin";
};

export type AddReturnPhotoResult =
  | { ok: true; id: number; url: string }
  | { error: "not_found" | "bad_status" | "too_many" };

// 업로드 — 행을 먼저 만들고 R2 에 올린다. R2 실패 시 행을 되돌려
// 오브젝트 없는 깨진 사진 행을 남기지 않는다(item_photos 와 같은 순서).
//
// 장수 제한은 INSERT ... WHERE COUNT < 3 가드로 동시 업로드까지 막는다.
export async function addReturnPhoto(
  db: Sql,
  env: Bindings,
  params: {
    reservationId: number;
    actor: ReturnPhotoActor;
    file: File;
    ext: string;
  },
): Promise<AddReturnPhotoResult> {
  const { reservationId, actor, file, ext } = params;
  const key = `reservations/${reservationId}/${crypto.randomUUID()}.${ext}`;

  const inserted = (await db.query(
    `INSERT INTO reservation_photos (
       reservation_id, r2_key, sort_order, uploaded_role, uploaded_by
     )
     SELECT ?1, ?2,
            (SELECT COALESCE(MAX(sort_order), 0) + 1
               FROM reservation_photos WHERE reservation_id = ?1),
            ?3, ?4
      WHERE EXISTS (
        SELECT 1 FROM reservations
         WHERE id = ?1
           AND status = 'rented'
           AND (?3 = 'admin' OR member_id = ?4)
      )
        AND (SELECT COUNT(*) FROM reservation_photos
              WHERE reservation_id = ?1) < ${MAX_RETURN_PHOTOS}
     RETURNING id`,
    [reservationId, key, actor.role, actor.id],
  )) as { id: number }[];

  if (inserted.length === 0) {
    // 0행의 원인을 재조회로 가른다 — 없음/타인 건은 404, 상태·장수는 409.
    const [row] = (await db.query(
      `SELECT status, member_id FROM reservations WHERE id = ?1`,
      [reservationId],
    )) as { status: string; member_id: string }[];
    if (!row) return { error: "not_found" };
    if (actor.role === "member" && row.member_id !== actor.id) {
      return { error: "not_found" };
    }
    if (row.status !== "rented") return { error: "bad_status" };
    return { error: "too_many" };
  }

  const photoId = inserted[0].id;
  try {
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    await db.query(`DELETE FROM reservation_photos WHERE id = ?1`, [photoId]);
    throw err;
  }
  return {
    ok: true,
    id: photoId,
    url: `/api/photos/${key}?access=owner`,
  };
}

// 삭제 — 회원은 본인 + 대여 중인 건만, 관리자는 상태와 무관하게 정정할 수 있다.
export async function deleteReturnPhoto(
  db: Sql,
  env: Bindings,
  params: {
    reservationId: number;
    photoId: number;
    actor: ReturnPhotoActor;
  },
): Promise<boolean> {
  const { reservationId, photoId, actor } = params;
  const rows = (await db.query(
    `DELETE FROM reservation_photos
      WHERE id = ?2 AND reservation_id = ?1
        AND EXISTS (
          SELECT 1 FROM reservations r
           WHERE r.id = ?1
             AND (?3 = 'admin' OR (r.member_id = ?4 AND r.status = 'rented'))
        )
     RETURNING r2_key`,
    [reservationId, photoId, actor.role, actor.id],
  )) as { r2_key: string }[];
  if (rows.length === 0) return false;
  try {
    await env.PHOTOS.delete(rows[0].r2_key);
  } catch (err) {
    // 행이 사라진 뒤 R2 만 남는 것은 회수 가능한 고아 오브젝트다 — 깨진 사진 행보다 낫다.
    console.error(`R2 반납 사진 삭제 실패 (reservation ${reservationId})`, err);
  }
  return true;
}

// 취소된 대여에 남은 사진 정리 — 반납 전에 업로드했다가 취소한 경우.
// 반납·취소 상태 전이는 이미 성공했으므로 호출부는 이 실패로 응답을 바꾸지 않는다.
export async function deleteReservationPhotos(
  db: Sql,
  env: Bindings,
  reservationId: number,
): Promise<void> {
  const rows = (await db.query(
    `DELETE FROM reservation_photos WHERE reservation_id = ?1 RETURNING r2_key`,
    [reservationId],
  )) as { r2_key: string }[];
  for (const row of rows) {
    try {
      await env.PHOTOS.delete(row.r2_key);
    } catch (err) {
      console.error(`R2 반납 사진 정리 실패 (reservation ${reservationId})`, err);
    }
  }
}

// 사진 열람 권한 — 반납 사진은 개인 공간이 찍힐 수 있어 모든 회원에게 열지 않는다.
// 본인 또는 관리자만 통과한다. 없는 키와 권한 없는 키를 같은 false 로 돌려
// URL 존재 여부를 흘리지 않는다.
export async function canViewReservationPhoto(
  db: Sql,
  r2Key: string,
  user: { id: string; role: string },
): Promise<boolean> {
  const [row] = (await db.query(
    `SELECT r.member_id
       FROM reservation_photos p
       JOIN reservations r ON r.id = p.reservation_id
      WHERE p.r2_key = ?1`,
    [r2Key],
  )) as { member_id: string }[];
  if (!row) return false;
  return user.role === "admin" || row.member_id === user.id;
}
