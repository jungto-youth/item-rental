import { Link } from "./link";
import { Show } from "solid-js";
import { itemStatus, type Item } from "../types";
import { ImagePlaceholderIcon } from "./icons";

export function ItemCard(props: { item: Item }) {
  const status = () => itemStatus(props.item);

  return (
    <Link
      role="listitem"
      href={`/items/${props.item.id}`}
      class="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div class="relative aspect-[4/3] bg-surface-muted">
        <span
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-3"
          aria-hidden="true"
        >
          <ImagePlaceholderIcon class="h-6 w-6 sm:h-8 sm:w-8" />
          <span class="text-fine text-ink-2">사진 없음</span>
        </span>
        <Show when={props.item.photos[0]}>
          {(src) => (
            <img
              src={src()}
              alt=""
              loading="lazy"
              class="absolute inset-0 h-full w-full object-cover"
              onError={(event) => event.currentTarget.remove()}
            />
          )}
        </Show>
      </div>
      <div class="flex flex-1 flex-col gap-2 p-4 max-sm:p-2">
        <h3 class="line-clamp-2 text-body font-semibold leading-[1.5] tracking-[-0.015em] text-ink-1 max-sm:text-fine">
          {props.item.name}
        </h3>
        <p class="truncate text-fine text-ink-2">
          <span class="max-sm:hidden">{props.item.category} · </span>
          {props.item.location}
        </p>
        <Show
          when={status() === "available"}
          fallback={
            <Show
              when={status() === "repair"}
              fallback={
                <p class="mt-auto flex items-center gap-1 text-fine">
                  <span
                    class="h-1.5 w-1.5 flex-none rounded-full bg-ink-3"
                    aria-hidden="true"
                  />
                  <span class="text-ink-2">대여 중</span>
                </p>
              }
            >
              <p class="mt-auto flex items-center gap-1 text-fine tabular-nums">
                <span
                  class="h-1.5 w-1.5 flex-none rounded-full bg-warning"
                  aria-hidden="true"
                />
                <span class="text-ink-2">수리 중</span>
                <span class="font-semibold text-ink-1">
                  {props.item.repair}개
                </span>
              </p>
            </Show>
          }
        >
          <p class="mt-auto flex items-center gap-1 text-fine tabular-nums">
            <span
              class="h-1.5 w-1.5 flex-none rounded-full bg-primary"
              aria-hidden="true"
            />
            <span class="font-semibold text-ink-1">
              {props.item.available}개
            </span>
            <span class="text-ink-2">대여 가능</span>
          </p>
        </Show>
      </div>
    </Link>
  );
}

export function ItemCardSkeleton(props: { class?: string }) {
  return (
    <div
      class={`overflow-hidden rounded-card border border-line bg-surface ${props.class ?? ""}`}
    >
      <div class="aspect-[4/3] animate-pulse bg-surface-muted motion-reduce:animate-none" />
      <div class="space-y-2 p-4 max-sm:p-2">
        <div class="h-4 w-3/4 animate-pulse rounded bg-line motion-reduce:animate-none" />
        <div class="h-3 w-1/2 animate-pulse rounded bg-line motion-reduce:animate-none" />
        <div class="h-4 w-2/3 animate-pulse rounded bg-line motion-reduce:animate-none" />
      </div>
    </div>
  );
}
