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
    <div class="photo-uploader">
      <div class="photos-box">
        <span class="photos-head">
          <span>사진 관리</span>
          <span class="photo-count">
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

        <div class="pics">
          <For each={props.entries}>
            {(photo, index) => (
              <div class="pic">
                <img src={photo.url} alt="" />
                <Show when={index() === 0}>
                  <span class="representative">대표</span>
                </Show>
                <button
                  type="button"
                  class="pic-del"
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
                class="add-tile"
                title="사진 추가"
                disabled={props.disabled}
                onClick={openChooser}
              >
                <span class="add-icon">
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
                <span class="add-main">사진 추가</span>
              </button>
            )}
          </For>
        </div>

        <p class="photo-hint">
          JPEG · PNG · WebP · 원본 용량 제한 없음 · 최대 {MAX_PHOTOS}장 · 업로드 전
          2MB 이하로 자동 축소
        </p>
        <Show when={cameraMessage()}>
          <p class="photo-hint" role="status">
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
        <p class="chooser-copy">사진을 추가할 방법을 선택하세요.</p>
        <div class="chooser-actions">
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
