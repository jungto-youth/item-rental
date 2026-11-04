import { Show, createSignal, onSettled } from "solid-js";
import { api, apiBlob } from "../../api/client";
import { makeThumbnail } from "../../utils/photo";
import { Button } from "../ui/button";

type MissingThumb = { item_id: number; photo_id: number; url: string };

// 썸네일이 없는 물품 사진(0013 이전 업로드 등)을 채운다 — Workers 는 이미지를 디코딩할 수
// 없어 관리자 브라우저가 원본을 받아 썸네일을 만들고 올린다. 채울 사진이 없으면 그리지 않는다.
export function ThumbnailBackfill() {
  const [missing, setMissing] = createSignal<MissingThumb[]>([]);
  const [running, setRunning] = createSignal(false);
  const [done, setDone] = createSignal(0);
  const [failed, setFailed] = createSignal(0);

  const load = async () => {
    try {
      const res = await api<{ photos: MissingThumb[] }>("/api/admin/items/photo-thumbs/missing");
      setMissing(res.photos);
    } catch {
      setMissing([]);
    }
  };

  onSettled(() => {
    void load();
  });

  const run = async () => {
    if (running()) return;
    setRunning(true);
    setDone(0);
    setFailed(0);
    // Solid 2 의 signal 쓰기는 flush 전까지 읽기에 보이지 않을 수 있어 개수는 지역 변수로 센다
    let ok = 0;
    let bad = 0;
    // 한 장씩 처리한다 — 원본 디코딩은 메모리를 많이 쓰고, 사진 수가 적어 병렬 이득이 작다
    for (const photo of missing()) {
      try {
        const original = await apiBlob(photo.url);
        const thumb = await makeThumbnail(original, `photo-${photo.photo_id}`);
        const data = new FormData();
        data.append("thumb", thumb);
        await api(`/api/admin/items/${photo.item_id}/photos/${photo.photo_id}/thumb`, {
          method: "PUT",
          body: data,
        });
        setDone(++ok);
      } catch {
        setFailed(++bad);
      }
    }
    setRunning(false);
    await load();
  };

  return (
    <Show when={missing().length > 0 || running()}>
      <section class="rounded-card border border-line bg-surface p-4">
        <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
          사진 썸네일
        </h2>
        <p class="mt-2 text-fine leading-normal text-ink-2" role="status">
          {running()
            ? `썸네일을 만들고 있습니다 (${done() + failed()} / ${missing().length})`
            : failed() > 0
              ? `${failed()}장을 처리하지 못했습니다. 다시 시도해 주세요.`
              : `썸네일이 없는 사진 ${missing().length}장이 있습니다. 목록에서는 원본을 대신 보여줍니다.`}
        </p>
        <div class="mt-4">
          <Button variant="secondary" loading={running()} disabled={running()} onClick={() => void run()}>
            썸네일 채우기
          </Button>
        </div>
      </section>
    </Show>
  );
}
