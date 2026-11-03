import { Show, createMemo } from "solid-js";
import type { Item } from "../../../types";
import { statusParts } from "../../../utils/stock";
import { ImageIcon } from "../../icons";

function StatusLabel(props: { part: { key: string; label: string } }) {
  const content = createMemo(() => {
    const match = props.part.label.match(/^(.*?)\s*(\d+)$/);
    if (!match) return <span class="rest">{props.part.label}</span>;
    const [, text, count] = match;
    if (props.part.key === "rented") {
      return <span class="rest">{text}</span>;
    }
    if (props.part.key === "available") {
      return (
        <>
          <b>{count}개</b>
          <span class="rest">{text}</span>
        </>
      );
    }
    return (
      <>
        <span class="rest">{text}</span>
        <b>{count}개</b>
      </>
    );
  });
  return <>{content()}</>;
}

export function ItemCard(props: { item: Item; href: string }) {
  const categories = () => (props.item.categories ?? []).map((c) => c.name).join(", ");
  const location = () => props.item.location ?? "";
  const photo = () => props.item.photos?.[0]?.url ?? "";
  const primary = () => statusParts(props.item)[0];

  return (
    <a class="item-card card" href={props.href}>
      <div class={`thumb ${photo() ? "" : "empty"}`}>
        <span class="fallback" aria-hidden="true">
          <ImageIcon />
          <Show when={!photo()}>
            <span class="fallback-text">사진 없음</span>
          </Show>
        </span>
        <Show when={photo()}>
          <img
            src={photo()}
            alt=""
            loading="lazy"
            onError={(event) => event.currentTarget.remove()}
          />
        </Show>
      </div>

      <div class="body">
        <span class="name" title={props.item.name}>
          {props.item.name}
        </span>
        <span
          class="meta"
          title={[categories(), location()].filter(Boolean).join(" · ")}
        >
          <Show when={categories()}>
            <span class="cat">
              {categories()}
              {location() ? " · " : ""}
            </span>
          </Show>
          <span class="loc">
            {location() || (categories() ? "" : "위치 미지정")}
          </span>
        </span>
        <span class="status">
          <Show
            when={primary()}
            fallback={<span class="rest">미지정</span>}
          >
            {(part) => (
              <span class={`primary ${part().key}`}>
                <span class={`dot ${part().key}`} aria-hidden="true" />
                <StatusLabel part={part()} />
              </span>
            )}
          </Show>
        </span>
      </div>
    </a>
  );
}
