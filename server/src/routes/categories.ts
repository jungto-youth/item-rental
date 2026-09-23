import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDb, type Sql } from "../db";
import { listCategories } from "../services/categories.service";

// GET /api/categories (전체 열람 가능)
// 이름·개수는 관리 화면(등록/수정 다이얼로그 자동완성, 물품 관리 페이지)에 쓰인다.
export const categoriesRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

categoriesRoute.get("/", async (c) => {
  const db: Sql = getDb(c.env);
  const categories = await listCategories(db);
  return c.json({ categories });
});
