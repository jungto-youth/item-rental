import { For, Show, createSignal } from "solid-js";
import type { ReservationPhoto } from "../../../types";
import { Modal } from "../../ui/modal";

// 반납 사진 썸네일 — 목록 행에 붙는다. 관리자 화면은 showRole 로 누가 올린
// 사진인지(회원 증빙/관리자 확인) 구분해 보여준다.
export function ReturnPhotoStrip(props: {
  photos: ReservationPhoto[];
  showRole?: boolean;
}) {
  const [selected, setSelected] = createSignal<ReservationPhoto | null>(null);

  const roleLabel = (photo: ReservationPhoto) =>
    photo.uploaded_role === "admin" ? "관리자 첨부" : "회원 첨부";

  return (
    <Show when={props.photos.length > 0}>
      <div class="mt-1 flex flex-col gap-2">
        <span class="text-fine font-medium text-ink-2">
          반납 사진 · {props.photos.length}장
        </span>
        <div class="flex flex-wrap items-start gap-2">
          <For each={props.photos}>
            {(photo, index) => (
              <div class="flex w-20 flex-col items-center gap-1">
                <button
                  type="button"
                  class="aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-card border border-line bg-surface-muted p-0 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
                  onClick={() => setSelected(photo)}
                  aria-label={`반납 사진 ${index() + 1} 크게 보기`}
                >
                  <img
                    class="block size-full object-cover"
                    src={photo.url}
                    alt={`반납 사진 ${index() + 1}`}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => event.currentTarget.remove()}
                  />
                </button>
                <Show when={props.showRole}>
                  <span class="text-center text-fine leading-normal text-ink-2">
                    {photo.uploaded_role === "admin" ? "관리자" : "회원"}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      <Modal
        open={selected() !== null}
        title="반납 사진"
        maxWidth="720px"
        onClose={() => setSelected(null)}
      >
        <Show when={selected()}>
          {(photo) => (
            <figure class="m-0">
              <img
                class="block max-h-[70vh] w-full rounded-card border border-line bg-surface-muted object-contain"
                src={photo().url}
                alt="반납 사진 크게 보기"
              />
              <figcaption class="mt-2 text-fine text-ink-2">
                {roleLabel(photo())}
              </figcaption>
            </figure>
          )}
        </Show>
      </Modal>
    </Show>
  );
}
