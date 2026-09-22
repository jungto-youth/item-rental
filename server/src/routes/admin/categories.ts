import { Hono } from "hono";
import type { Bindings, Variables } from "../../types";
import { getDb, type Sql } from "../../db";
import { requireAdmin } from "../../middleware/auth";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "../../services/categories.service";

// /api/admin/categories (카테고리 생성·이름변경·삭제, admin 전용)
// 물품 등록 다이얼로그에서 새 이름을 쓰면 생성이 자동으로 호출되고,
// 이름 변경은 id 기준이라 물품 전체에 반영된다. 삭제된 카테고리의 물품은 미지정이 된다.
export const adminCategoriesRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
adminCategoriesRoute.use("*", requireAdmin);

function readName(body: Record<string, unknown>): string | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  return name ? name : null;
}

adminCategoriesRoute.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const name = readName(body);
  if (!name) return c.json({ error: "name 필수" }, 400);

  const db: Sql = getDb(c.env);
  const result = await createCategory(db, name);
  if ("error" in result) return c.json({ error: "이미 있는 카테고리 이름" }, 409);
  return c.json({ id: result.id }, 201);
});

adminCategoriesRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
  const body = await c.req.json<Record<string, unknown>>();
  const name = readName(body);
  if (!name) return c.json({ error: "name 필수" }, 400);

  const db: Sql = getDb(c.env);
  const result = await renameCategory(db, id, name);
  if ("error" in result) {
    const dup = result.error === "dup";
    return c.json(
      { error: dup ? "이미 있는 카테고리 이름" : "not_found" },
      dup ? 409 : 404,
    );
  }
  return c.json({ ok: true });
});

adminCategoriesRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);

  const db: Sql = getDb(c.env);
  const result = await deleteCategory(db, id);
  if ("error" in result) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
