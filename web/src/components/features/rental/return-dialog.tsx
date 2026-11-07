import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { api, ApiError } from "../../../api/client";
import type { ReservationPhoto } from "../../../types";
import { MAX_RETURN_PHOTOS } from "../../../../../shared/photo-limits";
import { processPhoto } from "../../../utils/photo";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Modal } from "../../ui/modal";
import {
  PhotoUploader,
  type PhotoEntry,
} from "../item/photo-uploader";

type StagedPhoto = { file: File; url: string; key: string };

type TargetReservation = {
  id: number;
  item_name: string;
  qty: number;
  return_photos: ReservationPhoto[];
};

export type ReturnDialogResult = {
  message: string;
  tone: "info" | "success" | "error";
};

// 반납 확인 모달 — 회원과 관리자가 같은 흐름을 쓴다. API 경로와 uploaded_role 만 다르다.
// 사진은 선택이며, 업로드가 실패해도 '사진 없이 반납'으로 대여 상태를 정상 전이한다.
export function ReturnDialog(props: {
  open: boolean;
  reservation: TargetReservation | null;
  mode: "member" | "admin";
  onClose: () => void;
  onFinished: (result: ReturnDialogResult) => void;
}) {
  const [photos, setPhotos] = createSignal<ReservationPhoto[]>([]);
  const [staged, setStaged] = createSignal<StagedPhoto[]>([]);
  const [note, setNote] = createSignal("");
  const [photoBusy, setPhotoBusy] = createSignal(false);
  const [returning, setReturning] = createSignal(false);
  const [uploadFailed, setUploadFailed] = createSignal(false);
  const [error, setError] = createSignal("");

  let generation = 0;
  let stagedSeq = 0;

  const busy = () => photoBusy() || returning();

  const clearStaged = () => {
    for (const entry of staged()) URL.revokeObjectURL(entry.url);
    setStaged([]);
  };

  // 열릴 때마다 서버에 이미 붙은 사진을 새로 읽는다 — 대여 중에 미리 올렸다가
  // 닫은 경우 다음에 열어도 같은 사진이 보여야 한다.
  createEffect(
    () => props.open,
    (open) => {
      if (!open) {
        untrack(clearStaged);
        return;
      }
      const reservation = untrack(() => props.reservation);
      if (!reservation) return;
      generation++;
      untrack(() => {
        clearStaged();
        setPhotos(reservation.return_photos);
        setNote("");
        setPhotoBusy(false);
        setReturning(false);
        setUploadFailed(false);
        setError("");
      });
    },
  );

  onCleanup(clearStaged);

  const entries = (): PhotoEntry[] => [
    ...photos().map((photo) => ({ url: photo.url, key: photo.id })),
    ...staged().map((photo) => ({ url: photo.url, key: photo.key })),
  ];

  const basePath = (id: number) =>
    props.mode === "admin"
      ? `/api/admin/reservations/${id}`
      : `/api/reservations/${id}`;

  const onUpload = (files: File[]) => {
    if (busy()) return;
    void (async () => {
      setPhotoBusy(true);
      setError("");
      const gen = generation;
      try {
        for (const file of files) {
          if (photos().length + staged().length >= MAX_RETURN_PHOTOS) {
            setError(`사진은 최대 ${MAX_RETURN_PHOTOS}장까지 등록할 수 있습니다`);
            break;
          }
          try {
            const processed = await processPhoto(file);
            if (gen !== generation) return;
            setStaged((prev) => [
              ...prev,
              {
                file: processed,
                url: URL.createObjectURL(processed),
                key: `s${stagedSeq++}`,
              },
            ]);
          } catch (err) {
            if (gen !== generation) return;
            setError(
              err instanceof Error ? err.message : "이미지 처리에 실패했습니다",
            );
          }
        }
      } finally {
        if (gen === generation) setPhotoBusy(false);
      }
    })();
  };

  const onRemove = (key: string | number) => {
    if (busy()) return;
    if (typeof key === "string") {
      const entry = staged().find((photo) => photo.key === key);
      if (!entry) return;
      URL.revokeObjectURL(entry.url);
      setStaged((prev) => prev.filter((photo) => photo.key !== key));
      return;
    }
    const reservation = props.reservation;
    if (!reservation) return;
    void (async () => {
      setPhotoBusy(true);
      setError("");
      try {
        await api(`${basePath(reservation.id)}/photos/${key}`, {
          method: "DELETE",
        });
        setPhotos((prev) => prev.filter((photo) => photo.id !== key));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "사진을 삭제하지 못했습니다",
        );
      } finally {
        setPhotoBusy(false);
      }
    })();
  };

  // 사진을 하나씩 올린다. 성공한 사진은 즉시 photos 로 옮겨, 반납 호출이 실패해
  // 다시 눌러도 같은 사진을 두 번 올리지 않게 한다.
  const uploadStaged = async (
    reservationId: number,
  ): Promise<boolean> => {
    const list = staged();
    for (const entry of list) {
      const data = new FormData();
      data.append("file", entry.file);
      try {
        const created = await api<{ id: number; url: string }>(
          `${basePath(reservationId)}/photos`,
          { method: "POST", body: data },
        );
        setPhotos((prev) => [
          ...prev,
          {
            id: created.id,
            url: created.url,
            uploaded_role: props.mode === "admin" ? "admin" : "member",
          },
        ]);
        URL.revokeObjectURL(entry.url);
        setStaged((prev) => prev.filter((photo) => photo.key !== entry.key));
      } catch (err) {
        setError(
          err instanceof Error
            ? `사진 업로드에 실패했습니다: ${err.message}`
            : "사진 업로드에 실패했습니다",
        );
        setUploadFailed(true);
        return false;
      }
    }
    return true;
  };

  const submit = async (skipPhotos = false) => {
    const reservation = props.reservation;
    if (!reservation || busy()) return;
    setReturning(true);
    setError("");
    setUploadFailed(false);
    try {
      if (skipPhotos) {
        untrack(clearStaged);
      } else if (!(await uploadStaged(reservation.id))) {
        return;
      }

      await api(`${basePath(reservation.id)}/return`, {
        method: "POST",
        body: JSON.stringify({ note: note().trim() || undefined }),
      });
      props.onFinished({
        message: `${reservation.item_name} 반납을 완료했습니다`,
        tone: "success",
      });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      // 이미 다른 곳에서 반납·취소된 건 — 모달을 닫고 목록을 새로 읽게 한다.
      if (code === "bad_status" || code === "not_found") {
        props.onFinished({
          message: "이미 처리되었거나 찾을 수 없는 대여입니다",
          tone: "info",
        });
        return;
      }
      setError(err instanceof Error ? err.message : "반납 처리에 실패했습니다");
    } finally {
      setReturning(false);
    }
  };

  const close = () => {
    if (busy()) return;
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      title={props.mode === "admin" ? "반납 처리" : "반납하기"}
      maxWidth="520px"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" disabled={busy()} onClick={close}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={returning()}
            disabled={photoBusy() || !props.reservation}
            onClick={() => void submit()}
          >
            반납 완료
          </Button>
        </>
      }
    >
      <Show when={props.reservation}>
        {(reservation) => (
          <>
            <p class="m-0 text-fine leading-normal text-ink-2">
              '{reservation().item_name}'
              {reservation().qty > 1 ? ` ${reservation().qty}개를` : "를"} 반납합니다.
              물품 상태 사진을 남기면 파손·분실 확인에 도움이 됩니다. (선택)
            </p>

            <Input
              class="mt-4"
              label="반납 특이사항 (선택)"
              type="textarea"
              rows={3}
              placeholder="예: 구성품 일부가 빠질 뻔했습니다 / 파손은 없습니다"
              value={note()}
              disabled={busy()}
              onInput={setNote}
            />
            <p class="mt-2 mb-0 text-fine leading-normal text-ink-2">
              분실·파손·구성품 누락 등 남길 내용이 있으면 적어 주세요. 500자 이내.
            </p>

            <div class="mt-4">
              <PhotoUploader
                entries={entries()}
                max={MAX_RETURN_PHOTOS}
                label="반납 상태 사진"
                showCoverBadge={false}
                disabled={busy()}
                hint={`JPEG · PNG · WebP · 최대 ${MAX_RETURN_PHOTOS}장 · 업로드 전 2MB 이하로 자동 축소`}
                onUpload={onUpload}
                onRemove={onRemove}
              />
            </div>

            <p class="mt-2 mb-0 text-fine leading-normal text-ink-2">
              사진은 본인과 관리자만 볼 수 있습니다. 사진이 없어도 반납할 수
              있습니다.
            </p>

            <Show when={error()}>
              <p
                class="mt-3 mb-0 rounded-card border border-danger bg-danger-soft px-4 py-2 text-fine leading-normal text-danger"
                role="alert"
              >
                {error()}
              </p>
            </Show>

            <Show when={uploadFailed()}>
              <div class="mt-3 rounded-card border border-line bg-surface-muted p-4">
                <p class="m-0 text-fine leading-normal text-ink-2">
                  사진 업로드에 실패해도 반납은 진행할 수 있습니다.
                </p>
                <Button
                  class="mt-2"
                  variant="secondary"
                  disabled={busy()}
                  onClick={() => void submit(true)}
                >
                  사진 없이 반납
                </Button>
              </div>
            </Show>
          </>
        )}
      </Show>
    </Modal>
  );
}
