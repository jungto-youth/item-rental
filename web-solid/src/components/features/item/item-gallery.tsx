import { For, Show, createEffect, createSignal, untrack } from "solid-js";
import type { Photo } from "../../../types";
import { ImageIcon } from "../../icons";

export function ItemGallery(props: { photos: Photo[]; name: string }) {
  const [selected, setSelected] = createSignal(0);
  const current = () => props.photos[selected()] ?? props.photos[0];

  createEffect(
    () => props.photos.length,
    (length) => {
      untrack(() => {
        if (length === 0) setSelected(0);
        else if (selected() >= length) setSelected(0);
      });
    },
  );

  const onThumbError = (idx: number) => {
    if (idx === selected()) {
      const next = props.photos.findIndex((_, i) => i !== idx);
      if (next !== -1) setSelected(next);
    }
  };

  return (
    <div class="item-gallery">
      <div class="main-photo">
        <span class="fallback" aria-hidden="true">
          <ImageIcon />
        </span>
        <Show when={current()}>
          <img
            src={current().url}
            alt={props.name ? `${props.name} 사진` : "물품 사진"}
            onError={(event) => event.currentTarget.remove()}
          />
        </Show>
        <Show when={props.photos.length > 0}>
          <span class="counter" aria-hidden="true">
            {selected() + 1} / {props.photos.length}
          </span>
        </Show>
      </div>

      <Show when={props.photos.length > 1}>
        <div class="thumbs">
          <For each={props.photos}>
            {(photo, idx) => (
              <button
                type="button"
                class={`thumb-btn ${idx() === selected() ? "active" : ""}`}
                onClick={() => setSelected(idx())}
                aria-label={`사진 ${idx() + 1}`}
                aria-pressed={idx() === selected() ? "true" : "false"}
              >
                <span class="fallback" aria-hidden="true">
                  <ImageIcon />
                </span>
                <img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.remove();
                    onThumbError(idx());
                  }}
                />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
