import { api } from "../api/client";

// 태그(카테고리) 이름 배열 → id 배열. 기존 목록에 정확히 같은 이름이 있으면 그 id 를,
// 새 이름이면 서버에 먼저 만들고 받은 id 를 돌려준다. 빈 배열·공백 이름은 무시한다.
// 등록/수정 다이얼로그는 이름만 들고 있다가 저장 시점에 부른다 — 같은 이름이 여러 번
// 쓰여도 목록을 한 번만 받고 name→id 맵으로 일괄 결정해 중복 생성이 없다.
export async function resolveCategoryIds(names: string[]): Promise<number[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const { categories } = await api<{
    categories: { id: number; name: string }[];
  }>("/api/categories");
  const known = new Map(categories.map((c) => [c.name, c.id]));

  const ids: number[] = [];
  for (const name of unique) {
    const hit = known.get(name);
    if (hit) {
      ids.push(hit);
    } else {
      const created = await api<{ id: number }>("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      known.set(name, created.id);
      ids.push(created.id);
    }
  }
  return ids;
}