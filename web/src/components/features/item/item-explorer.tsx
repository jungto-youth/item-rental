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
import { availableQty, queueCapacity } from "../../../utils/stock";
import type { JSX } from "@solidjs/web";
import { Button } from "../../ui/button";
import { Empty } from "../../ui/empty";
import { Notice } from "../../ui/notice";
import { Skeleton } from "../../ui/skeleton";
import { ItemCard } from "./item-card";

export type TabKey = "all" | "available" | "reserved" | "rented" | "repair";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "available", label: "대여 가능" },
  { key: "reserved", label: "예약 가능" },
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
  // 검색어와 키워드로 맞는 물품이 없어 의미 검색의 비슷한 물품만 나온 경우
  const [similarOnly, setSimilarOnly] = createSignal(false);

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
    if (props.tab === "reserved") {
      return (
        item.lifecycle === "active" &&
        item.kind !== "consumable" &&
        availableQty(item) === 0 &&
        queueCapacity(item) > 0
      );
    }
    return item.kind !== "consumable" && availableQty(item) > 0;
  };

  // 관리자도 목록에서는 공개 상세로 들어간다 — 수정은 상세의 '수정' 버튼이 맡는다.
  // 검색·상태 필터를 쿼리로 넘겨, 상세의 '목록으로'가 같은 목록으로 돌아오게 한다.
  const hrefFor = (item: Item) =>
    `/items/${item.id}${window.location.search}`;

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
        err instanceof Error ? err.message : "물품 목록을 불러오지 못했습니다",
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
        const res = await api<{ items: Item[]; similar?: boolean }>(`/api/items?${params}`);
        if (gen !== fetchGen || untrack(isAdmin)) return;
        setItems(res.items);
        setSimilarOnly(res.similar === true);
        setHasMore(false);
      } else {
        const res = await api<BrowseResponse>(browseUrl(0));
        if (gen !== fetchGen || untrack(isAdmin)) return;
        setItems(res.items);
        setSimilarOnly(false);
        setHasMore(res.hasMore);
      }
    } catch (err) {
      if (gen !== fetchGen || untrack(isAdmin)) return;
      setError(
        err instanceof Error ? err.message : "물품 목록을 불러오지 못했습니다",
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
      setNoticeMsg("더 불러오지 못했습니다 — 다시 시도해 주세요");
    } finally {
      setLoadingMore(false);
    }
  };

  const retryMore = async () => {
    setNoticeMsg("");
    await loadMore();
    watchSentinel();
  };

  // ===== 무한 스크롤 =====
  // 목록 끝의 센티넬을 IntersectionObserver 로 감시하다가, 화면에 가까워지면
  // 다음 묶음을 자동으로 불러온다. '더보기' 버튼은 두지 않는다.
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  const SENTINEL_MARGIN = 600;

  // 지금 더 불러올 것이 있고, 다른 요청이 진행 중이 아닌지.
  // 오류 안내가 떠 있으면 사용자가 '다시 시도'를 누를 때까지 자동 로드를 멈춘다.
  const canAutoLoad = () => {
    // loading 은 회원 목록(fetchItems)만 내린다. 관리자는 이 값이 계속 true 라
    // 그대로 두면 자동 로드가 영영 막힌다 — 회원일 때만 본다.
    if ((!isAdmin() && loading()) || loadingMore() || adminLoading() || noticeMsg())
      return false;
    if (isAdmin()) return shown() < adminVisible().length;
    if (props.q)
      return items().filter((item) => matchesTab(item)).length > shown();
    return hasMore();
  };

  const listSize = () => shown() + items().length;

  // 관찰을 다시 걸면 현재 교차 상태로 콜백이 한 번 더 온다 — 목록이 화면을
  // 다 채우지 못해 센티넬이 계속 보이는 경우에도 이어서 불러오기 위해서다.
  const watchSentinel = () => {
    if (!observer || !sentinel) return;
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  };

  // 센티넬이 미리 불러올 거리(observer 의 rootMargin 과 같은 600px) 안에 있는지.
  // 다시 observe 한 뒤 콜백을 주지 않는 브라우저도 있어 스크롤·리사이즈 때
  // 이 값으로 직접 확인한다.
  const sentinelNearViewport = () => {
    if (!sentinel) return false;
    return (
      sentinel.getBoundingClientRect().top <= window.innerHeight + SENTINEL_MARGIN
    );
  };

  // 자동 로드 요청이 겹치지 않게 — 관리자는 shown 만 늘리므로 loadingMore 가 없다.
  let autoLoading = false;

  const attachSentinel = (el: HTMLDivElement) => {
    sentinel = el;
    watchSentinel();
    if (sentinelNearViewport()) autoLoadMore();
  };

  const autoLoadMore = () => {
    if (autoLoading || !canAutoLoad()) return;
    autoLoading = true;
    const before = listSize();
    void moreItems().finally(() => {
      autoLoading = false;
      // 목록이 실제로 늘었을 때만 이어간다 — 빈 페이지가 반복되어도 끝없이
      // 요청하지 않는다.
      if (listSize() > before) {
        watchSentinel();
        // 다시 observe 해도 콜백이 오지 않는 경우를 대비해, 센티넬이 아직
        // 화면 근처면 다음 묶음을 직접 이어서 부른다.
        requestAnimationFrame(() => {
          if (sentinelNearViewport()) autoLoadMore();
        });
      }
    });
  };

  // 스크롤·리사이즈 보조 경로 — observer 가 놓친 경우에도 센티넬 위치로 판단한다.
  let scrollRaf = 0;
  const checkSentinelOnScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (sentinelNearViewport()) autoLoadMore();
    });
  };

  onSettled(() => {
    const admin = session.isAdmin();
    setIsAdmin(admin);
    if (admin) void loadAdmin();
    else void fetchItems();

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) autoLoadMore();
      },
      // 목록 끝이 화면에 닿기 전에 미리 불러온다.
      { rootMargin: `0px 0px ${SENTINEL_MARGIN}px 0px` },
    );
    watchSentinel();
    window.addEventListener("scroll", checkSentinelOnScroll, { passive: true });
    window.addEventListener("resize", checkSentinelOnScroll, { passive: true });

    return () => {
      if (searchTimer) clearTimeout(searchTimer);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("scroll", checkSentinelOnScroll);
      window.removeEventListener("resize", checkSentinelOnScroll);
      observer?.disconnect();
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
        title: `'${props.q}'로 찾은 물품이 없습니다`,
        subtitle: "다른 이름이나 위치로 검색해 보세요.",
      };
    }
    const label = TABS.find((tab) => tab.key === props.tab)?.label;
    if (label && props.tab !== "all") {
      return {
        title: `'${label}' 물품이 없습니다`,
        subtitle: "다른 상태를 선택해 보세요.",
      };
    }
    return {
      title: "등록된 물품이 없습니다",
      subtitle: isAdmin()
        ? "첫 물품을 등록하면 회원이 대여를 신청할 수 있습니다."
        : "관리자가 물품을 등록하면 여기에 표시됩니다.",
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
            <Skeleton tone="muted" class="aspect-[4/3]" />
            <div class="grid gap-2 p-4 max-sm:p-2">
              <Skeleton class="h-4 w-3/4 rounded" />
              <Skeleton class="h-3 w-1/2 rounded" />
              <Skeleton class="h-3 w-2/3 rounded" />
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
        <div
          ref={attachSentinel}
          class="mb-8 flex min-h-9 items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Show when={loadingMore()}>
            <span class="inline-flex items-center gap-1 text-body font-medium text-ink-2">
              <span
                class="size-3.5 animate-[spin_0.6s_linear_infinite] rounded-full border-2 border-current border-r-transparent"
                aria-hidden="true"
              />
              불러오는 중…
            </span>
          </Show>
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
          <Show when={props.q && similarOnly()}>
            <div class="mb-4 block">
              <Notice>
                '{props.q}'에 정확히 맞는 물품이 없어 비슷한 물품을 보여줍니다.
              </Notice>
            </div>
          </Show>
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
              1000건까지만 불러왔습니다 — 목록이 잘렸을 수 있습니다
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
