import { For, Show, createEffect, createSignal } from "solid-js";
import { MAX_PHOTOS } from "../../../../../shared/photo-limits";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";
import { CameraCaptureDialog } from "./camera-capture-dialog";

export type PhotoEntry = { url: string; key: string | number };

export function PhotoUploader(props: {
  entries: PhotoEntry[];
  multiple?: boolean;
  disabled?: boolean;
  onUpload: (files: File[]) => void;
  onRemove: (key: string | number) => void;
}) {
  let filesInput: HTMLInputElement | undefined;
  let cameraInput: HTMLInputElement | undefined;

  const [chooserOpen, setChooserOpen] = createSignal(false);
  const [cameraOpen, setCameraOpen] = createSignal(false);
  const [cameraMessage, setCameraMessage] = createSignal("");

  const canAdd = () => !props.disabled && props.entries.length < MAX_PHOTOS;

  const openChooser = () => {
    if (!canAdd()) return;
    setChooserOpen(true);
  };

  const chooseFiles = () => {
    setChooserOpen(false);
    requestAnimationFrame(() => {
      if (canAdd()) filesInput?.click();
    });
  };

  const chooseCamera = () => {
    setChooserOpen(false);
    requestAnimationFrame(() => openCamera());
  };

  const openCamera = () => {
    if (!canAdd()) return;
    setCameraMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        !window.isSecureContext
          ? "실시간 카메라는 HTTPS 또는 localhost에서 사용할 수 있어요. 여기서는 기기의 촬영/파일 선택 화면을 사용해요"
          : "실시간 카메라를 지원하지 않는 브라우저예요. 기기의 촬영/파일 선택 화면을 사용해요",
      );
      cameraInput?.click();
      return;
    }
    setCameraOpen(true);
  };

  const handleSelect = (event: Event & { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!canAdd() || files.length === 0) return;
    props.onUpload(files);
  };

  createEffect(
    () => canAdd(),
    (can) => {
      if (!can) setCameraOpen(false);
    },
  );

  return (
    <div class="block">
      <div class="flex flex-col gap-2">
        <span class="flex items-center justify-between gap-4 text-fine font-medium text-ink-2">
          <span>사진 관리</span>
          <span class="tabular-nums">
            {props.entries.length} / {MAX_PHOTOS}
          </span>
        </span>

        <input
          ref={filesInput}
          type="file"
          hidden
          disabled={props.disabled}
          multiple={props.multiple}
          accept="image/jpeg,image/png,image/webp"
          onChange={handleSelect}
        />
        <input
          ref={cameraInput}
          type="file"
          hidden
          disabled={props.disabled}
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleSelect}
        />

        <div class="grid grid-cols-3 gap-2">
          <For each={props.entries}>
            {(photo, index) => (
              <div class="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-surface-muted">
                <img class="block size-full object-cover" src={photo.url} alt="" />
                <Show when={index() === 0}>
                  <span class="absolute top-2 left-2 inline-flex h-6 items-center rounded-pill bg-primary-soft px-2 text-fine font-medium text-primary-strong">대표</span>
                </Show>
                <button
                  type="button"
                  class="absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-pill border-0 bg-[rgba(17,24,39,0.7)] text-fine leading-[1.2] text-white hover:bg-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1 disabled:cursor-wait disabled:opacity-50"
                  title="사진 삭제"
                  aria-label="사진 삭제"
                  disabled={props.disabled}
                  onClick={() => props.onRemove(photo.key)}
                >
                  ×
                </button>
              </div>
            )}
          </For>
          <For each={Array.from({ length: MAX_PHOTOS - props.entries.length })}>
            {() => (
              <button
                type="button"
                class="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface p-0 text-ink-2 leading-[1.2] hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50"
                title="사진 추가"
                disabled={props.disabled}
                onClick={openChooser}
              >
                <span class="flex items-center justify-center text-ink-2 [&_svg]:size-5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                </span>
                <span class="text-fine text-ink-2">사진 추가</span>
              </button>
            )}
          </For>
        </div>

        <p class="m-0 text-fine text-ink-2">
          JPEG · PNG · WebP · 원본 용량 제한 없음 · 최대 {MAX_PHOTOS}장 · 업로드 전
          2MB 이하로 자동 축소
        </p>
        <Show when={cameraMessage()}>
          <p class="m-0 text-fine text-ink-2" role="status">
            {cameraMessage()}
          </p>
        </Show>
      </div>

      <Modal
        open={chooserOpen()}
        title="사진 추가"
        maxWidth="400px"
        onClose={() => setChooserOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setChooserOpen(false)}>
            닫기
          </Button>
        }
      >
        <p class="mb-4 text-fine text-ink-2">사진을 추가할 방법을 선택하세요.</p>
        <div class="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
          <Button variant="secondary" onClick={chooseCamera}>
            사진 촬영
          </Button>
          <Button variant="primary" onClick={chooseFiles}>
            사진 업로드
          </Button>
        </div>
      </Modal>

      <CameraCaptureDialog
        open={cameraOpen()}
        onCaptured={(file) => {
          setCameraOpen(false);
          if (canAdd()) props.onUpload([file]);
        }}
        onClose={() => setCameraOpen(false)}
      />
    </div>
  );
}
