import {
  For,
  Show,
  createEffect,
  createSignal,
  onSettled,
} from "solid-js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import { navigate } from "../router";
import type { Item } from "../types";
import { availableQty, queueCapacity } from "../utils/stock";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Empty } from "../components/ui/empty";
import { InfoList } from "../components/ui/info-list";
import { Skeleton } from "../components/ui/skeleton";
import { Tag } from "../components/ui/tag";
import { TextButton } from "../components/ui/text-button";
import { ChevronLeftIcon } from "../components/icons";
import { ItemGallery } from "../components/features/item/item-gallery";
import { ItemRentalForm } from "../components/features/item/item-rental-form";
import { RentalSteps } from "../components/features/item/rental-steps";
import { ItemCard } from "../components/features/item/item-card";

export default function ItemDetail(props: { params: Record<string, string> }) {
  const [item, setItem] = createSignal<Item | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [related, setRelated] = createSignal<Item[]>([]);
  const [relatedCategory, setRelatedCategory] = createSignal("");
  const [user, setUser] = createSignal<SessionUser | null>(null);
  const [userReady, setUserReady] = createSignal(false);

  let loadGen = 0;
  const itemId = () => props.params.id;

  const loadRelated = async (current: Item, gen: number) => {
    const category = current.categories?.[0]?.name ?? "";
    setRelatedCategory(category);
    if (!category) {
      setRelated([]);
      return;
    }
    try {
      const { items } = await api<{ items: Item[] }>("/api/items?limit=60");
      if (gen !== loadGen) return;
      setRelated(
        items
          .filter(
            (entry) =>
              entry.id !== current.id &&
              (entry.categories ?? []).some((c) => c.name === category),
          )
          .slice(0, 4),
      );
    } catch {
      if (gen === loadGen) setRelated([]);
    }
  };

  const load = async (quiet = false) => {
    const gen = ++loadGen;
    if (!quiet) setLoading(true);
    try {
      const res = await api<{ item: Item }>(`/api/items/${itemId()}`);
      if (gen !== loadGen) return;
      setItem(res.item);
      setError("");
      void loadRelated(res.item, gen);
    } catch (err) {
      if (gen !== loadGen) return;
      if (!quiet) {
        setError(
          err instanceof Error ? err.message : "물품 정보를 불러오지 못했습니다",
        );
      }
    } finally {
      if (gen === loadGen && !quiet) setLoading(false);
    }
  };

  createEffect(
    () => itemId(),
    (id) => {
      if (id) void load(false);
    },
  );

  onSettled(() => {
    void session.ensure().then((current) => {
      setUser(current);
      setUserReady(true);
    });
  });

  const isAdmin = () => user()?.role === "admin";
  const availableNow = () => (item() ? availableQty(item()!) : 0);

  const attrPairs = (): [string, string][] => {
    const it = item();
    if (!it) return [];
    const pairs: [string, string][] = [];
    if (it.kind === "consumable") {
      pairs.push(["보유 수량", `${it.total_qty}개`]);
      pairs.push(["구분", "소모품"]);
    } else {
      pairs.push(["대여 가능", `${availableNow()}개`]);
      if (availableNow() === 0) {
        const queue = queueCapacity(it);
        if (queue > 0) pairs.push(["예약 가능", `${queue}개`]);
      }
      if ((it.pending_qty ?? 0) > 0) {
        pairs.push(["승인 대기", `${it.pending_qty}개`]);
      }
      if ((it.reserved_qty ?? 0) > 0) {
        pairs.push(["예약 대기", `${it.reserved_qty}개`]);
      }
      pairs.push(["전체 보유", `${it.total_qty}개`]);
      if ((it.qty_repair ?? 0) > 0) pairs.push(["수리 중", `${it.qty_repair}개`]);
    }
    if (it.location) pairs.push(["보관 위치", it.location]);
    return pairs;
  };

  const availabilityText = (it: Item) => {
    if (it.availability_badge === "available") return `대여 가능 ${availableNow()}개`;
    if (it.availability_badge === "reserved") {
      const queue = queueCapacity(it);
      return queue > 1 ? `예약 가능 ${queue}개` : "예약 가능";
    }
    if (it.availability_badge === "unavailable") return "신청 마감";
    if (it.availability_badge === "repair") return "수리 중";
    if (it.availability_badge === "retired") return "폐기";
    // 0012 이전 계약과의 호환 — 새 API 는 rented 대신 reserved/unavailable 을 내린다.
    if (it.availability_badge === "rented") return "대여 중";
    return "";
  };

  const topNav = () => (
    <div class="mb-4 flex items-center justify-between gap-4">
      <TextButton
        href={window.location.search ? `/${window.location.search}` : "/"}
        icon={<ChevronLeftIcon />}
      >
        목록으로
      </TextButton>
      <Show when={item() && isAdmin()}>
        <Button
          variant="secondary"
          onClick={() => navigate(`/items/${item()!.id}/edit`)}
        >
          수정
        </Button>
      </Show>
    </div>
  );

  return (
    <div class="block">
      <Show when={error()}>
        {topNav()}
        <Empty
          state="error"
          text={error()}
          subtitle="삭제되었거나 연결이 불안정합니다."
        >
          <Button variant="primary" onClick={() => void load()}>
            다시 시도
          </Button>
          <Button variant="secondary" onClick={() => navigate("/")}>
            목록으로
          </Button>
        </Empty>
      </Show>

      <Show when={!error() && (loading() || !item())}>
        {topNav()}
        <div
          class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
          role="status"
          aria-label="물품 정보를 불러오는 중"
        >
          <div class="flex flex-col gap-2" aria-hidden="true">
            <Skeleton
              tone="muted"
              class="aspect-[4/3] rounded-card border border-line"
            />
            <div class="grid grid-cols-3 gap-2">
              <Skeleton tone="muted" class="aspect-[4/3] rounded-card" />
              <Skeleton tone="muted" class="aspect-[4/3] rounded-card" />
              <Skeleton tone="muted" class="aspect-[4/3] rounded-card" />
            </div>
          </div>
          <div class="grid content-start gap-4 pt-2" aria-hidden="true">
            <Skeleton class="h-7 w-3/5 rounded" />
            <Skeleton class="h-3.5 w-[90%] rounded" />
            <Skeleton class="h-3.5 w-[70%] rounded" />
            <Skeleton class="h-3.5 w-[45%] rounded" />
            <Skeleton tone="muted" class="h-[120px] rounded-card" />
          </div>
        </div>
      </Show>

      <Show when={!error() && !loading() && item()}>
        {(current) => {
          const it = current;
          const attrs = () => attrPairs();
          const availability = () => availabilityText(it());
          return (
            <>
              {topNav()}
              <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                <ItemGallery photos={it().photos} name={it().name} />

                <div class="flex min-w-0 flex-col">
                  <div class="flex flex-wrap items-center gap-2">
                    <h1 class="m-0 text-page-title font-bold tracking-tight text-ink-1">{it().name}</h1>
                    <Show when={availability()}>
                      <Badge kind={it().availability_badge} label={availability()} />
                    </Show>
                  </div>

                  <Show when={it().description}>
                    <p class="mt-4 whitespace-pre-wrap text-body leading-normal text-ink-2 [overflow-wrap:anywhere]">{it().description}</p>
                  </Show>
                  <Show when={it().categories?.length}>
                    <div class="mt-4 flex flex-wrap gap-2" aria-label="분류">
                      <For each={it().categories}>
                        {(category) => <Tag>#{category.name}</Tag>}
                      </For>
                    </div>
                  </Show>
                  <Show when={attrs().length > 0}>
                    <InfoList
                      strongFirst
                      items={attrs().map(([label, value]) => ({
                        label,
                        value,
                      }))}
                    />
                  </Show>

                  <div class="mt-6"><ItemRentalForm
                    item={it()}
                    user={user()}
                    userReady={userReady()}
                    onRented={() => void load(true)}
                  /></div>
                  <RentalSteps class="mt-4" />
                </div>
              </div>

              <Show when={related().length > 0}>
                <section class="mt-8 border-t border-line pt-8">
                  <div class="flex items-end justify-between gap-4">
                    <div>
                      <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">{relatedCategory()} 물품 더 보기</h2>
                      <p class="mt-2 text-fine text-ink-2">함께 쓰면 좋은 물품입니다</p>
                    </div>
                    <a class="text-body font-medium text-primary-strong no-underline hover:text-primary" href="/">전체 보기</a>
                  </div>
                  <div class="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4" role="list">
                    <For each={related()}>
                      {(entry) => (
                        <div role="listitem">
                          <ItemCard item={entry} href={`/items/${entry.id}`} />
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            </>
          );
        }}
      </Show>
    </div>
  );
}
