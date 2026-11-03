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
      invalidateCategories();
    }
  }
  return ids;
}
