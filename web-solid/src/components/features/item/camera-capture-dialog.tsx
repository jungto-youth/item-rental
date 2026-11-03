import { Show, createEffect, createSignal, onSettled } from "solid-js";
import { MAX_PHOTO_EDGE } from "../../../../../shared/photo-limits";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";

export function CameraCaptureDialog(props: {
  open: boolean;
  onCaptured: (file: File) => void;
  onClose: () => void;
}) {
  let video: HTMLVideoElement | undefined;
  let stream: MediaStream | null = null;
  let generation = 0;

  const [starting, setStarting] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [capturing, setCapturing] = createSignal(false);
  const [error, setError] = createSignal("");

  const stopCamera = () => {
    generation++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setReady(false);
    setStarting(false);
    setCapturing(false);
  };

  const startCamera = async () => {
    if (!props.open) return;
    stopCamera();
    const gen = generation;
    setStarting(true);
    setError("");
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (gen !== generation || !props.open) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      for (const track of next.getVideoTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (stream !== next) return;
            stopCamera();
            setError("카메라 연결이 끊겼어요. 연결을 확인하고 다시 시도해주세요");
          },
          { once: true },
        );
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (gen !== generation || !props.open) return;
      if (!video) throw new Error("카메라 미리보기를 열 수 없어요");
      video.srcObject = next;
      await video.play();
      if (gen !== generation || !props.open) return;
      setReady(video.videoWidth > 0 && video.videoHeight > 0);
    } catch (err) {
      if (gen !== generation || !props.open) return;
      stopCamera();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("카메라 사용 권한이 없어요. 브라우저와 기기 설정에서 카메라를 허용해주세요");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("사용할 수 있는 카메라가 없어요. 카메라 연결과 기기 설정을 확인해주세요");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("카메라를 사용할 수 없어요. 다른 앱에서 사용 중인지 확인해주세요");
      } else {
        setError("카메라를 열 수 없어요. 브라우저와 카메라 설정을 확인해주세요");
      }
    } finally {
      if (gen === generation) setStarting(false);
    }
  };

  const close = () => {
    stopCamera();
    props.onClose();
  };

  const capture = async () => {
    if (!ready() || capturing() || !props.open) return;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    setError("");
    const gen = generation;
    const canvas = document.createElement("canvas");
    try {
      const scale = Math.min(
        1,
        MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("사진을 만들 수 없어요");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (gen !== generation || !props.open) return;
      if (!blob) throw new Error("사진을 만들 수 없어요");
      const file = new File([blob], `camera-${Date.now()}.png`, {
        type: blob.type,
      });
      props.onCaptured(file);
      close();
    } catch {
      if (gen === generation && props.open) {
        setError("사진 촬영에 실패했어요. 다시 시도해주세요");
      }
    } finally {
      canvas.width = canvas.height = 0;
      if (gen === generation) setCapturing(false);
    }
  };

  createEffect(
    () => props.open,
    (open) => {
      if (open) void startCamera();
      else stopCamera();
      return () => {
        if (open) stopCamera();
      };
    },
  );

  onSettled(() => {
    const onPageHide = () => close();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") close();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      stopCamera();
    };
  });

  return (
    <Modal
      open={props.open}
      title="카메라 촬영"
      maxWidth="640px"
      onClose={close}
      footer={
        <div class="camera-actions">
          <Button variant="secondary" onClick={close}>
            취소
          </Button>
          <Show when={error()}>
            <Button
              variant="secondary"
              disabled={starting()}
              onClick={() => void startCamera()}
            >
              다시 시도
            </Button>
          </Show>
          <Button
            variant="primary"
            loading={capturing()}
            disabled={!ready()}
            onClick={() => void capture()}
          >
            촬영
          </Button>
        </div>
      }
    >
      <video
        ref={video}
        autoplay
        muted
        playsinline
        aria-label="카메라 미리보기"
      />
      <Show when={starting()}>
        <p class="message" role="status">
          카메라를 열고 있어요. 권한 요청이 나오면 허용해주세요
        </p>
      </Show>
      <Show when={error()}>
        <p class="message error" role="alert">
          {error()}
        </p>
      </Show>
    </Modal>
  );
}
