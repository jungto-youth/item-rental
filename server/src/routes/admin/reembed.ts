import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import { embedItem } from "../../embedding";

// 전 물품 임베딩 백필 (admin 전용, PLAN §8)
// Workers AI는 워커 밖(스크립트)에서 호출할 수 없어 옛 scripts/reembed.ts를 대체한다.
// 시트 일괄 반영(import-items.ts → SQL 적용) 뒤 이 엔드포인트를 반복 호출해 임베딩을 채운다.
//
// 무료 플랜은 요청당 서브리퀘스트 50개 한계가 있고 물품 1건이 SELECT·AI·UPDATE 약 3개를
// 쓰므로 한 번에 EMBEDS_PER_CALL 건만 처리한다. 응답의 next_after를 다음 호출의 after로
// 넘기고, next_after가 null이면 끝이다.
//
// 사용 (쿠키는 브라우저 /api/auth 로그인 세션에서 복사):
//   curl -X POST .../api/admin/reembed-all             — 임베딩 없는 물품만
//   curl -X POST .../api/admin/reembed-all -d '{"all":true}'        — 전체 재생성
//   curl -X POST .../api/admin/reembed-all -d '{"after":41}'        — 이어서
export const adminReembedRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

adminReembedRoute.use("*", requireAdmin);

const EMBEDS_PER_CALL = 15;

adminReembedRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    after?: number;
    all?: boolean;
  };
  const after =
    Number.isInteger(body.after) && (body.after as number) >= 0
      ? (body.after as number)
      : 0;
  const db: Sql = getDb(c.env);
  const targets = (await db.query(
    `SELECT id FROM items
      WHERE id > ?1 AND status <> 'retired' ${body.all ? "" : "AND embedding IS NULL"}
      ORDER BY id LIMIT ${EMBEDS_PER_CALL}`,
    [after],
  )) as { id: number }[];

  for (const { id } of targets) {
    // embedItem은 실패를 삼키고 로그만 남긴다 — 실패한 건(기본 모드)은 embedding이
    // NULL로 남아 다음 호출의 대상이 된다
    await embedItem(c.env, db, id);
  }

  const nextAfter = targets.at(-1)?.id ?? null;
  return c.json({
    processed: targets.length,
    // LIMIT를 채웠으면 뒤에 더 있을 수 있다 — 채우지 못했으면 끝
    next_after: targets.length === EMBEDS_PER_CALL ? nextAfter : null,
  });
});
