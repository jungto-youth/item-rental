import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
} from "solid-js";
import { api } from "../../../api/client";
import { session } from "../../../context/session";
import { navigate } from "../../../router";
import type { Item } from "../../../types";
import { availableQty } from "../../../utils/stock";
import type { JSX } from "@solidjs/web";
import { Button } from "../../ui/button";
import { Empty } from "../../ui/empty";
import { Notice } from "../../ui/notice";
import { ItemCard } from "./item-card";

export type TabKey = "all" | "available" | "rented" | "repair";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "available", label: "대여 가능" },
  { key: "rented", label: "대여 중" },
  { key: "repair", label: "수리 중" },
];

const PAGE_SIZE = 10;

type BrowseResponse = {
  items: Item[];
  total: number;
  matched: number;
  hasMore: boolean;
};

type AdminListResponse = {
  items: Item[];
  total: number;
  hasMore: boolean;
};

export function ItemExplorer(props: {
  q: string;
  tab: TabKey;
  onClearSearch: () => void;
}) {
  const [isAdmin, setIsAdmin] = createSignal(false);

  const [items, setItems] = createSignal<Item[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [hasMore, setHasMore] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [noticeMsg, setNoticeMsg] = createSignal("");

  const [adminItems, setAdminItems] = createSignal<Item[]>([]);
  const [adminLoading, setAdminLoading] = createSignal(false);
  const [adminError, setAdminError] = createSignal("");
  const [truncated, setTruncated] = createSignal(false);
  const [shown, setShown] = createSignal(PAGE_SIZE);

  let fetchGen = 0;
  let adminGen = 0;
  let searchTimer = 0;
  let firstRole = true;
  let firstQ = true;
  let firstTab = true;

  const matchesTab = (item: Item): boolean => {
    if (props.tab === "all") return true;
    if (props.tab === "rented") return (item.active_now ?? 0) > 0;
    if (props.tab === "repair")
      return item.lifecycle !== "retired" && (item.qty_repair ?? 0) > 0;
    return item.kind !== "consumable" && availableQty(item) > 0;
  };

  const hrefFor = (item: Item) =>
    isAdmin() ? `/items/${item.id}/edit` : `/items/${item.id}${window.location.search}`;

  const syncRole = () => {
    const admin = session.isAdmin();
    if (admin === isAdmin()) return;
    setIsAdmin(admin);
    setShown(PAGE_SIZE);
    if (admin) {
      void loadAdmin();
    } else {
      adminGen += 1;
      setAdminItems([]);
      setAdminError("");
      if (items().length === 0) void fetchItems();
    }
  };

  const loadAdmin = async () => {
    const gen = ++adminGen;
    setAdminLoading(true);
    setAdminError("");
    try {
      const listRes = await api<AdminListResponse>("/api/admin/items?limit=1000");
      if (gen !== adminGen || !untrack(isAdmin)) return;
      setAdminItems(listRes.items);
      setTruncated(listRes.hasMore === true);
      setShown(PAGE_SIZE);
    } catch (err) {
      if (gen !== adminGen || !untrack(isAdmin)) return;
      setAdminError(
        err instanceof Error ? err.message : "물품 목록을 불러오지 못했어요",
      );
    } finally {
      if (gen === adminGen && untrack(isAdmin)) setAdminLoading(false);
    }
  };

  const adminQueryMatches = createMemo(() => {
    const q = props.q.trim().toLowerCase();
    if (!q) return adminItems();
    return adminItems().filter((item) => {
      const cats = item.categories ?? [];
      const hay = `${item.name} ${item.location ?? ""} ${item.description ?? ""} ${cats
        .map((c) => c.name)
        .join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  });

  const adminVisible = createMemo(() =>
    adminQueryMatches().filter((item) => matchesTab(item)),
  );

  const stateParam = () => (props.tab === "all" ? null : props.tab);

  const browseUrl = (offset: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    const state = stateParam();
    if (state) params.set("state", state);
    return `/api/items?${params.toString()}`;
  };

  const fetchItems = async () => {
    const gen = ++fetchGen;
    const first = items().length === 0;
    if (first) setLoading(true);
    setError("");
    setNoticeMsg("");
    try {
      if (props.q) {
        const params = new URLSearchParams({ q: props.q });
        const res = await api<{ items: Item[] }>(`/api/items?${params}`);
        if (gen !== fetchGen || untrack(isAdmin)) return;
        setItems(res.items);
        setHasMore(false);
      } else {
        const res = await api<BrowseResponse>(browseUrl(0));
        if (gen !== fetchGen || untrack(isAdmin)) return;
        setItems(res.items);
        setHasMore(res.hasMore);
      }
    } catch (err) {
      if (gen !== fetchGen || untrack(isAdmin)) return;
      setError(
        err instanceof Error ? err.message : "물품 목록을 불러오지 못했어요",
      );
    } finally {
      if (gen === fetchGen && !untrack(isAdmin)) setLoading(false);
    }
  };

  const scheduleFetch = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void fetchItems(), 250);
  };

  const loadMore = async () => {
    if (props.q || loading() || loadingMore() || !hasMore() || isAdmin()) return;
    const gen = fetchGen;
    setLoadingMore(true);
    try {
      const res = await api<BrowseResponse>(browseUrl(items().length));
      if (gen !== fetchGen || untrack(() => props.q) || untrack(isAdmin)) return;
      setItems([...items(), ...res.items]);
      setHasMore(res.hasMore);
    } catch {
      setNoticeMsg("더 불러오지 못했어요 — 다시 시도해 주세요");
    } finally {
      setLoadingMore(false);
    }
  };

  const retryMore = async () => {
    setNoticeMsg("");
    await loadMore();
  };

  onSettled(() => {
    const admin = session.isAdmin();
    setIsAdmin(admin);
    if (admin) void loadAdmin();
    else void fetchItems();
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  createEffect(
    () => session.isAdmin(),
    () => {
      if (firstRole) {
        firstRole = false;
        return;
      }
      untrack(syncRole);
    },
  );

  createEffect(
    () => props.q,
    () => {
      if (firstQ) {
        firstQ = false;
        return;
      }
      untrack(() => {
        setShown(PAGE_SIZE);
        if (!isAdmin()) scheduleFetch();
      });
    },
  );

  createEffect(
    () => props.tab,
    () => {
      if (firstTab) {
        firstTab = false;
        return;
      }
      untrack(() => {
        setShown(PAGE_SIZE);
        if (!isAdmin() && !props.q) {
          setItems([]);
          setLoading(true);
          void fetchItems();
        }
      });
    },
  );

  const emptyCopy = () => {
    if (props.q) {
      return {
        title: `'${props.q}'로 찾은 물품이 없어요`,
        subtitle: "다른 이름이나 위치로 검색해 보세요.",
      };
    }
    const label = TABS.find((tab) => tab.key === props.tab)?.label;
    if (label && props.tab !== "all") {
      return {
        title: `'${label}' 물품이 없어요`,
        subtitle: "다른 상태를 선택해 보세요.",
      };
    }
    return {
      title: "등록된 물품이 없어요",
      subtitle: isAdmin()
        ? "첫 물품을 등록하면 회원이 대여를 신청할 수 있어요."
        : "관리자가 물품을 등록하면 여기에 표시돼요.",
    };
  };

  const renderState = (
    state: "loading" | "empty" | "error",
    text = "",
    action?: JSX.Element,
    subtitle = "",
  ) => (
    <div class="mb-6 max-sm:mb-4">
      <Empty state={state} text={text} subtitle={subtitle}>
        {action}
      </Empty>
    </div>
  );

  const renderSkeleton = () => (
    <div class="mb-6 grid grid-cols-2 gap-2 max-sm:mb-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" role="status" aria-label="물품 목록을 불러오는 중">
      <For each={Array.from({ length: 5 })}>
        {() => (
          <div class="overflow-hidden rounded-card border border-line bg-surface max-sm:[&:nth-child(n+4)]:hidden md:max-xl:[&:nth-child(n+5)]:hidden" aria-hidden="true">
            <div class="aspect-[4/3] animate-[pulse_1.4s_ease-in-out_infinite] bg-surface-muted" />
            <div class="grid gap-2 p-4 max-sm:p-2">
              <div class="h-4 w-3/4 animate-[pulse_1.4s_ease-in-out_infinite] rounded bg-line" />
              <div class="h-3 w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded bg-line" />
              <div class="h-3 w-2/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded bg-line" />
            </div>
          </div>
        )}
      </For>
    </div>
  );

  const renderGrid = (list: () => Item[], more: () => boolean) => (
    <>
      <div class="mb-6 grid grid-cols-2 gap-2 max-sm:mb-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" role="list">
        <For each={list()}>
          {(item) => (
            <div role="listitem">
              <ItemCard item={item} href={hrefFor(item)} />
            </div>
          )}
        </For>
      </div>
      <Show when={more()}>
        <div class="mb-8 flex justify-center">
          <Button
            variant="secondary"
            loading={loadingMore()}
            onClick={() => void moreItems()}
          >
            {loadingMore() ? "불러오는 중…" : "더보기"}
          </Button>
        </div>
      </Show>
    </>
  );

  const moreItems = async () => {
    if (isAdmin() || props.q) {
      setShown(shown() + PAGE_SIZE);
      return;
    }
    await loadMore();
  };

  const renderMember = () => {
    const matched = () =>
      props.q ? items().filter((item) => matchesTab(item)) : items();
    const visible = () =>
      props.q ? matched().slice(0, shown()) : matched();

    return (
      <>
        <Show when={error()}>
          {renderState(
            "error",
            error(),
            <Button variant="secondary" onClick={() => void fetchItems()}>
              다시 시도
            </Button>,
            "연결 상태를 확인하고 다시 시도해 주세요.",
          )}
        </Show>
        <Show when={!error() && loading()}>{renderSkeleton()}</Show>
        <Show when={!error() && !loading() && visible().length === 0}>
          {renderState(
            "empty",
            emptyCopy().title,
            props.q ? (
              <Button variant="secondary" onClick={props.onClearSearch}>
                검색어 지우기
              </Button>
            ) : undefined,
            emptyCopy().subtitle,
          )}
        </Show>
        <Show when={!error() && !loading() && visible().length > 0}>
          <Show when={noticeMsg()}>
            <div class="mb-4 block">
              <Notice
                action={
                  <Button variant="secondary" onClick={() => void retryMore()}>
                    다시 시도
                  </Button>
                }
              >
                {noticeMsg()}
              </Notice>
            </div>
          </Show>
          {renderGrid(visible, () =>
            props.q ? matched().length > shown() : hasMore(),
          )}
        </Show>
      </>
    );
  };

  const renderAdmin = () => {
    const visible = () => adminVisible();
    return (
      <>
        <Show when={adminLoading()}>{renderSkeleton()}</Show>
        <Show when={!adminLoading() && adminError()}>
          {renderState(
            "error",
            adminError(),
            <Button variant="secondary" onClick={() => void loadAdmin()}>
              다시 시도
            </Button>,
            "연결 상태를 확인하고 다시 시도해 주세요.",
          )}
        </Show>
        <Show when={!adminLoading() && !adminError() && visible().length === 0}>
          {renderState(
            "empty",
            emptyCopy().title,
            props.q ? (
              <Button variant="secondary" onClick={props.onClearSearch}>
                검색어 지우기
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate("/items/new")}>
                물품 등록
              </Button>
            ),
            emptyCopy().subtitle,
          )}
        </Show>
        <Show when={!adminLoading() && !adminError() && visible().length > 0}>
          <Show when={truncated()}>
            <p class="mb-4 text-fine leading-normal text-ink-2">
              1000건까지만 불러왔어요 — 목록이 잘렸을 수 있어요
            </p>
          </Show>
          {renderGrid(
            () => visible().slice(0, shown()),
            () => shown() < visible().length,
          )}
        </Show>
      </>
    );
  };

  return (
    <div class="flex flex-col">
      <Show when={isAdmin()} fallback={renderMember()}>
        {renderAdmin()}
      </Show>
    </div>
  );
}
