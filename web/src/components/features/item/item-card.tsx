import { Show, createMemo } from "solid-js";
import type { Item } from "../../../types";
import { statusParts } from "../../../utils/stock";
import { ImageIcon } from "../../icons";

function StatusLabel(props: { part: { key: string; label: string } }) {
  const content = createMemo(() => {
    const match = props.part.label.match(/^(.*?)\s*(\d+)$/);
    if (!match) return <span class="text-ink-2">{props.part.label}</span>;
    const [, text, count] = match;
    if (props.part.key === "rented") {
      return <span class="text-ink-2">{text}</span>;
    }
    if (props.part.key === "available") {
      return (
        <>
          <b class="font-semibold text-ink-1">{count}개</b>
          <span class="text-ink-2">{text}</span>
        </>
      );
    }
    return (
      <>
        <span class="text-ink-2">{text}</span>
        <b class="font-semibold text-ink-1">{count}개</b>
      </>
    );
  });
  return <>{content()}</>;
}

export function ItemCard(props: { item: Item; href: string }) {
  const categories = () => (props.item.categories ?? []).map((c) => c.name).join(", ");
  const location = () => props.item.location ?? "";
  const photo = () => props.item.photos?.[0]?.thumb_url ?? "";
  // 썸네일 로드가 실패하면 원본으로 한 번 물러난다 (썸네일이 없으면 서버가 같은 URL을 내린다)
  let thumbFailed = false;
  const primary = () => statusParts(props.item)[0];
  const strong = () =>
    primary()?.key === "available" || primary()?.key === "reserved";

  return (
    <a
      class="item-card flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-inherit no-underline hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      href={props.href}
    >
      <div class="relative flex aspect-[3/2] items-center justify-center overflow-hidden bg-surface-muted text-ink-3">
        <span class="flex flex-col items-center gap-2" aria-hidden="true">
          <ImageIcon class="size-8" />
          <Show when={!photo()}>
            <span class="text-fine leading-normal text-ink-2">사진 없음</span>
          </Show>
        </span>
        <Show when={photo()}>
          <img
            class="absolute inset-0 block size-full object-cover"
            src={photo()}
            alt=""
            loading="lazy"
            onError={(event) => {
              const original = props.item.photos?.[0]?.url;
              if (!thumbFailed && original) {
                thumbFailed = true;
                event.currentTarget.src = original;
                return;
              }
              event.currentTarget.remove();
            }}
          />
        </Show>
      </div>

      <div class="flex flex-1 flex-col gap-1 p-4 max-sm:p-3">
        <span
          class="line-clamp-2 text-body font-semibold tracking-tight text-ink-1 max-sm:text-fine"
          title={props.item.name}
        >
          {props.item.name}
        </span>
        <span
          class="truncate text-fine leading-normal text-ink-2"
          title={[categories(), location()].filter(Boolean).join(" · ")}
        >
          <Show when={categories()}>
            <span class="max-sm:hidden">
              {categories()}
              {location() ? " · " : ""}
            </span>
          </Show>
          <span>{location() || (categories() ? "" : "위치 미지정")}</span>
        </span>
        <span class="flex flex-wrap items-center gap-1 text-fine leading-normal tabular-nums [word-break:keep-all]">
          <Show
            when={primary()}
            fallback={<span class="text-ink-2">미지정</span>}
          >
            {(part) => (
              <span
                class={`inline-flex items-center gap-2 whitespace-nowrap text-ink-1 ${
                  strong() ? "font-semibold" : "font-normal"
                }`}
              >
                <span
                  class={`size-1.5 shrink-0 rounded-full ${
                    part().key === "available" || part().key === "reserved"
                      ? "bg-primary"
                      : part().key === "repair"
                        ? "bg-warning"
                        : "bg-ink-3"
                  }`}
                  aria-hidden="true"
                />
                <StatusLabel part={part()} />
              </span>
            )}
          </Show>
        </span>
      </div>
    </a>
  );
}
