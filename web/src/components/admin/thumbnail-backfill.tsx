import { Show, createSignal, onSettled } from "solid-js";
import { api, apiBlob } from "../../api/client";
import { makeThumbnail } from "../../utils/photo";
import { Button } from "../ui/button";

type MissingThumb = { item_id: number; photo_id: number; url: string };
type MissingPage = { photos: MissingThumb[]; total: number };

// 한 번에 받는 사진 수 — 목록이 커도 응답·메모리를 작게 유지한다
const BATCH = 20;

// 썸네일이 없는 물품 사진(0013 이전 업로드 등)을 채운다 — Workers 는 이미지를 디코딩할 수
// 없어 관리자 브라우저가 원본을 받아 썸네일을 만들고 올린다. 채울 사진이 없으면 그리지 않는다.
export function ThumbnailBackfill() {
  const [total, setTotal] = createSignal(0);
  const [goal, setGoal] = createSignal(0);
  const [running, setRunning] = createSignal(false);
  const [done, setDone] = createSignal(0);
  const [failed, setFailed] = createSignal(0);

  const load = async () => {
    try {
      // 화면에는 개수만 필요하다 — 사진 한 장만 받아 total 을 채운다
      const res = await api<MissingPage>("/api/admin/items/photo-thumbs/missing?limit=1");
      setTotal(res.total);
    } catch {
      setTotal(0);
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
    // 이번 실행에서 처리할 전체 수 — 진행률 분모가 줄어들지 않게 시작 시점 값을 쓴다
    setGoal(total());
    // Solid 2 의 signal 쓰기는 flush 전까지 읽기에 보이지 않을 수 있어 개수는 지역 변수로 센다
    let ok = 0;
    let bad = 0;
    // id 커서로 나눠 받는다 — 실패한 사진이 목록에 남아도 커서가 앞으로만 가서 같은 사진을
    // 반복해서 집지 않는다(실패분은 다음 실행에서 다시 시도). 한 장씩 처리하는 이유는
    // 원본 디코딩이 메모리를 많이 쓰고 사진 수가 적어 병렬 이득이 작기 때문이다.
    let after = 0;
    try {
      for (;;) {
        const page = await api<MissingPage>(
          `/api/admin/items/photo-thumbs/missing?after=${after}&limit=${BATCH}`,
        );
        if (page.photos.length === 0) break;
        for (const photo of page.photos) {
          after = photo.photo_id;
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
      }
    } catch {
      // 목록 조회 실패 — 남은 사진은 다음 실행에서 이어서 처리한다
      setFailed(++bad);
    }
    setRunning(false);
    await load();
  };

  return (
    <Show when={total() > 0 || running()}>
      <section class="rounded-card border border-line bg-surface p-4">
        <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
          사진 썸네일
        </h2>
        <p class="mt-2 text-fine leading-normal text-ink-2" role="status">
          {running()
            ? `썸네일을 만들고 있습니다 (${done() + failed()} / ${goal()})`
            : failed() > 0
              ? `${failed()}장을 처리하지 못했습니다. 다시 시도해 주세요.`
              : `썸네일이 없는 사진 ${total()}장이 있습니다. 목록에서는 원본을 대신 보여줍니다.`}
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
