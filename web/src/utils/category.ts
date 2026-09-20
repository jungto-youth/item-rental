import { api } from "../api/client";
import type { Category } from "../types";

// 카테고리 이름 → id 변환. 기존 목록에 정확히 같은 이름이 있으면 그 id,
// 새 이름이면 서버에 먼저 만들고 받은 id를 돌려준다. 빈 값은 null(미지정).
// 등록/수정 다이얼로그는 이름만 들고 있다가 저장 시점에 부른다.
export async function resolveCategoryId(
  categories: Category[],
  name: string,
): Promise<number | null> {
  const t = name.trim();
  if (!t) return null;
  const hit = categories.find((c) => c.name === t);
  if (hit) return hit.id;
  const res = await api<{ id: number }>("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify({ name: t }),
  });
  return res.id;
}