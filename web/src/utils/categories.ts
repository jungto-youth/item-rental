// 카테고리 목록 캐시 — 여러 화면(관리자 물품 관리, 등록/수정 다이얼로그, 카테고리
// 관리 모달)이 같은 GET /api/categories 를 반복 호출하는 걸 막는다.
// 카테고리를 생성·이름변경·삭제한 뒤에는 반드시 invalidateCategories() 를 부른다.
import type { Category } from "../types";
import { api } from "../api/client";

let cache: Category[] | null = null;
let inflight: Promise<Category[]> | null = null;

export async function getCategories(): Promise<Category[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api<{ categories: Category[] }>("/api/categories")
      .then((res) => {
        cache = res.categories;
        return res.categories;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateCategories(): void {
  cache = null;
}
