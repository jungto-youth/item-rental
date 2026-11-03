import { Link } from "../components/link";
import { For, Show, createMemo, createSignal } from "solid-js";
import { ItemCard } from "../components/item-card";
import { PlusIcon } from "../components/icons";
import {
  EmptyState,
  FilterChip,
  SearchBox,
  btnPrimary,
  btnSecondary,
  btnSecondarySmall,
} from "../components/ui";
import { useAppStore } from "../store";
import { itemStatus, type ItemStatus } from "../types";

type Filter = "all" | ItemStatus;

export default function Home() {
  const store = useAppStore();
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<Filter>("all");
  const [visibleCount, setVisibleCount] = createSignal(10);

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    return store.state.items.filter((item) => {
      if (item.lifecycle !== "active" || item.kind !== "rental") return false;
      const statusOk = filter() === "all" || itemStatus(item) === filter();
      const searchOk =
        q === "" ||
        `${item.name} ${item.category} ${item.location}`
          .toLowerCase()
          .includes(q);
      return statusOk && searchOk;
    });
  });

  const visible = createMemo(() => filtered().slice(0, visibleCount()));
  const hasMore = () => filtered().length > visibleCount();

  const reset = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <div>
        <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
          물품 현황
        </h1>
        <p class="mt-2 text-fine text-ink-2">
          함께 쓰는 물품과 대여 상태를 확인해요.
        </p>
      </div>

      <div class="home-layout mt-6">
        <div class="home-search relative w-full">
          <SearchBox
            value={query()}
            onInput={setQuery}
            label="물품 검색"
            placeholder="이름, 위치, 분류 검색"
            class="w-full"
          />
        </div>

        <aside class="home-side" aria-label="물품 등록과 대여 안내">
          <Show when={store.isAdmin()}>
            <Link
              href="/items/new"
              class="hidden h-10 w-full items-center justify-center gap-2 rounded-card bg-primary-strong px-4 text-body font-semibold text-white transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex"
            >
              <PlusIcon class="h-4 w-4" />
              물품 등록
            </Link>
          </Show>

          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="text-body font-semibold tracking-[-0.015em] text-ink-1">
              대여 안내
            </h2>
            <p class="mt-2 text-fine leading-[1.5] text-ink-2">
              신청하면 바로 대여 중이 돼요. 반납은 대여 기록에서 할 수 있어요.
            </p>
            <Link href="/my-rentals" class={`${btnSecondarySmall} mt-4`}>
              내 대여 보기
            </Link>
          </section>
        </aside>

        <div class="home-main">
          <div
            class="flex flex-wrap items-center gap-2"
            aria-label="물품 상태 필터"
          >
            <For
              each={
                [
                  ["all", "전체"],
                  ["available", "대여 가능"],
                  ["rented", "대여 중"],
                  ["repair", "수리 중"],
                ] as [Filter, string][]
              }
            >
              {([value, label]) => (
                <FilterChip
                  active={filter() === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </FilterChip>
              )}
            </For>
          </div>

          <Show
            when={store.state.items.length > 0}
            fallback={
              <EmptyState
                class="mt-4"
                title="등록된 물품이 없어요"
                description={
                  store.isAdmin()
                    ? "첫 물품을 등록하면 회원이 바로 대여할 수 있어요."
                    : "관리자가 물품을 등록하면 여기에 표시돼요."
                }
                action={
                  <Show when={store.isAdmin()}>
                    <Link href="/items/new" class={btnPrimary}>
                      물품 등록
                    </Link>
                  </Show>
                }
              />
            }
          >
            <Show
              when={visible().length > 0}
              fallback={
                <div class="mt-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
                  <p class="text-body font-semibold text-ink-1">
                    찾는 물품이 없어요
                  </p>
                  <p class="mt-2 text-fine text-ink-2">
                    다른 이름이나 위치로 검색해 보세요.
                  </p>
                  <button
                    type="button"
                    class={`${btnSecondary} mt-4`}
                    onClick={reset}
                  >
                    검색어 지우기
                  </button>
                </div>
              }
            >
              <div
                class="mt-4 grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-5"
                role="list"
              >
                <For each={visible()}>{(item) => <ItemCard item={item} />}</For>
              </div>
            </Show>
          </Show>

          <Show when={hasMore()}>
            <div class="mt-8 flex justify-center">
              <button
                type="button"
                class="h-10 rounded-card border border-line bg-surface px-6 text-body font-medium text-ink-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={() => setVisibleCount((count) => count + 4)}
              >
                더보기
              </button>
            </div>
          </Show>
        </div>
      </div>
    </main>
  );
}
