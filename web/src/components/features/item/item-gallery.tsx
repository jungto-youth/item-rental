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
    <div class="block">
      <div class="relative flex aspect-[4/3] max-h-[480px] w-full items-center justify-center overflow-hidden rounded-card border border-line bg-surface-muted text-ink-3">
        <span class="[&_svg]:size-10" aria-hidden="true">
          <ImageIcon />
        </span>
        <Show when={current()}>
          <img
            class="absolute inset-0 block size-full object-cover"
            src={current().url}
            alt={props.name ? `${props.name} 사진` : "물품 사진"}
            onError={(event) => event.currentTarget.remove()}
          />
        </Show>
        <Show when={props.photos.length > 0}>
          <span
            class="absolute right-4 bottom-4 rounded-pill bg-[rgba(17,24,39,0.7)] px-2 py-1 text-fine leading-none tabular-nums text-white"
            aria-hidden="true"
          >
            {selected() + 1} / {props.photos.length}
          </span>
        </Show>
      </div>

      <Show when={props.photos.length > 1}>
        <div class="mt-2 grid grid-cols-3 gap-2">
          <For each={props.photos}>
            {(photo, idx) => (
              <button
                type="button"
                class={`relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-card border bg-surface-muted p-0 text-ink-3 leading-[1.2] [&_svg]:size-6 ${
                  idx() === selected()
                    ? "border-2 border-ink-1 hover:border-ink-1"
                    : "border-line hover:border-line-strong"
                }`}
                onClick={() => setSelected(idx())}
                aria-label={`사진 ${idx() + 1}`}
                aria-pressed={idx() === selected() ? "true" : "false"}
              >
                <span aria-hidden="true">
                  <ImageIcon />
                </span>
                <img
                  class="absolute inset-0 block size-full object-cover"
                  src={photo.thumb_url}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    const img = event.currentTarget;
                    // 썸네일 로드가 실패하면 원본으로 한 번 물러난다 (썸네일이 없으면 같은 URL)
                    if (img.dataset.fellBack !== "1" && photo.thumb_url !== photo.url) {
                      img.dataset.fellBack = "1";
                      img.src = photo.url;
                      return;
                    }
                    img.remove();
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
