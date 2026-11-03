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
import { availableQty } from "../utils/stock";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { ChevronLeftIcon } from "../components/icons";
import { ItemGallery } from "../components/features/item/item-gallery";
import { ItemRentalForm } from "../components/features/item/item-rental-form";
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
          err instanceof Error ? err.message : "물품 정보를 불러오지 못했어요",
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
      pairs.push(["전체 보유", `${it.total_qty}개`]);
      if ((it.qty_repair ?? 0) > 0) pairs.push(["수리 중", `${it.qty_repair}개`]);
    }
    if (it.location) pairs.push(["보관 위치", it.location]);
    return pairs;
  };

  const availabilityText = (it: Item) => {
    if (it.availability_badge === "available") return `대여 가능 ${availableNow()}개`;
    if (it.availability_badge === "repair") return "수리 중";
    if (it.availability_badge === "retired") return "폐기";
    if (it.availability_badge === "rented") return "대여 중";
    return "";
  };

  const topNav = () => (
    <div class="top-nav">
      <a
        class="back"
        href={window.location.search ? `/${window.location.search}` : "/"}
      >
        <ChevronLeftIcon />
        목록으로
      </a>
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
    <div class="page-item-detail">
      <Show when={error()}>
        {topNav()}
        <Empty
          state="error"
          text={error()}
          subtitle="삭제되었거나 연결이 불안정해요."
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
          class="content-col"
          role="status"
          aria-label="물품 정보를 불러오는 중"
        >
          <div class="sk-media" aria-hidden="true">
            <div class="sk-gallery" />
            <div class="sk-thumbs">
              <div class="sk-thumb" />
              <div class="sk-thumb" />
              <div class="sk-thumb" />
            </div>
          </div>
          <div class="sk-info" aria-hidden="true">
            <div class="sk-line title" />
            <div class="sk-line wide" />
            <div class="sk-line mid" />
            <div class="sk-line short" />
            <div class="sk-block" />
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
              <div class="content-col">
                <ItemGallery photos={it().photos} name={it().name} />

                <div class="info-col">
                  <div class="title-row">
                    <h1>{it().name}</h1>
                    <Show when={availability()}>
                      <span class={`availability ${it().availability_badge}`}>
                        {availability()}
                      </span>
                    </Show>
                  </div>

                  <Show when={it().description}>
                    <p class="desc">{it().description}</p>
                  </Show>
                  <Show when={it().categories?.length}>
                    <div class="tags" aria-label="분류">
                      <For each={it().categories}>
                        {(category) => <span class="tag">#{category.name}</span>}
                      </For>
                    </div>
                  </Show>
                  <Show when={attrs().length > 0}>
                    <dl class="attrs">
                      <For each={attrs()}>
                        {([key, value], index) => (
                          <div class={`attr-row ${index() === 0 ? "strong" : ""}`}>
                            <dt>{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        )}
                      </For>
                    </dl>
                  </Show>

                  <ItemRentalForm
                    item={it()}
                    user={user()}
                    userReady={userReady()}
                    onRented={() => void load(true)}
                  />
                </div>
              </div>

              <Show when={related().length > 0}>
                <section class="related">
                  <div class="related-head">
                    <div>
                      <h2>{relatedCategory()} 물품 더 보기</h2>
                      <p>함께 쓰면 좋은 물품이에요</p>
                    </div>
                    <a href="/">전체 보기</a>
                  </div>
                  <div class="related-grid" role="list">
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
