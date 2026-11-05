// 물품 사진 썸네일 — 업로드·응답 계약(thumb_url)·백필·삭제 정리를 HTTP 로 고정한다.
//
// 썸네일은 선택이다: 없으면 thumb_url 이 원본으로 물러나고, 관리자 화면이 나중에 채운다.
// 원본과 썸네일은 R2 에 따로 저장되므로 삭제 경로가 둘 다 지우는지도 함께 확인한다.
import { test, expect } from "vitest";
import { httpFixture, PNG, TEST_ORIGIN } from "./_http.fixture.ts";

function photoForm(withThumb: boolean, thumbType = "image/png") {
  const form = new FormData();
  form.set("file", new File([PNG], "photo.png", { type: "image/png" }));
  if (withThumb) form.set("thumb", new File([PNG], "photo.thumb.png", { type: thumbType }));
  return form;
}

function thumbForm() {
  const form = new FormData();
  form.set("thumb", new File([PNG], "photo.thumb.png", { type: "image/png" }));
  return form;
}

async function setup() {
  const fixture = httpFixture();
  fixture.db.exec("INSERT INTO items (id, name) VALUES (1, '썸네일 검사');");
  const admin = await fixture.member("admin", "admin");
  const user = await fixture.member("user");
  const post = (body: FormData) =>
    fixture.request("/api/admin/items/1/photos", { method: "POST", headers: { origin: TEST_ORIGIN, cookie: admin }, body });
  const putThumb = (photoId: number) =>
    fixture.request(`/api/admin/items/1/photos/${photoId}/thumb`, { method: "PUT", headers: { origin: TEST_ORIGIN, cookie: admin }, body: thumbForm() });
  const missing = async (after = 0, limit = 20) =>
    (await (await fixture.request(`/api/admin/items/photo-thumbs/missing?after=${after}&limit=${limit}`, { headers: { cookie: admin } })).json()) as {
      photos: { item_id: number; photo_id: number; url: string }[];
      total: number;
    };
  return { ...fixture, admin, user, post, putThumb, missing };
}

test("썸네일: 함께 올리면 원본 옆에 저장되고 목록·상세가 thumb_url 로 내린다", async () => {
  const { db, request, objects, user, post, missing } = await setup();
  try {
    const res = await post(photoForm(true));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number; url: string; thumb_url: string };
    expect(created.thumb_url).toMatch(/^\/api\/photos\/items\/1\/[^/]+\.thumb\.png\?access=members$/);
    expect(created.thumb_url).not.toBe(created.url);
    // 원본과 썸네일은 같은 UUID 를 쓴다
    const uuid = created.url.match(/items\/1\/([^/.]+)\.png/)![1];
    expect([...objects.keys()].sort()).toEqual([`items/1/${uuid}.png`, `items/1/${uuid}.thumb.png`]);

    const detail = (await (await request("/api/items/1", { headers: { cookie: user } })).json()) as {
      item: { photos: { url: string; thumb_url: string }[] };
    };
    expect(detail.item.photos).toEqual([{ id: created.id, url: created.url, thumb_url: created.thumb_url }]);
    const list = (await (await request("/api/items", { headers: { cookie: user } })).json()) as {
      items: { photos: { thumb_url: string }[] }[];
    };
    expect(list.items[0].photos[0].thumb_url).toBe(created.thumb_url);

    const served = await request(created.thumb_url, { headers: { cookie: user } });
    expect(served.status).toBe(200);
    expect(await missing()).toEqual({ photos: [], total: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM item_photos WHERE thumb_r2_key IS NOT NULL").get()).toEqual({ n: 1 });
  } finally { db.close(); }
});

test("썸네일: 없이 올리면 thumb_url 이 원본으로 물러나고 백필 목록에 오른다", async () => {
  const { db, objects, post, missing } = await setup();
  try {
    const res = await post(photoForm(false));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number; url: string; thumb_url: string };
    expect(created.thumb_url).toBe(created.url);
    expect(objects.size).toBe(1);
    expect(await missing()).toEqual({
      photos: [{ item_id: 1, photo_id: created.id, url: created.url }],
      total: 1,
    });
  } finally { db.close(); }
});

test("썸네일 백필: 목록은 id 커서로 나눠 내리고 total 은 남은 전체 개수다", async () => {
  const { db, post, missing } = await setup();
  try {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const created = (await (await post(photoForm(false))).json()) as { id: number };
      ids.push(created.id);
    }

    const first = await missing(0, 2);
    expect(first.total).toBe(3);
    expect(first.photos.map((p) => p.photo_id)).toEqual(ids.slice(0, 2));

    const second = await missing(first.photos[1].photo_id, 2);
    expect(second.total).toBe(3);
    expect(second.photos.map((p) => p.photo_id)).toEqual([ids[2]]);

    // 처리에 실패해 목록에 남은 사진을 같은 실행에서 다시 집지 않도록, 커서 이후만 내려온다
    const afterLast = await missing(ids[2], 2);
    expect(afterLast.photos).toEqual([]);
    expect(afterLast.total).toBe(3);
  } finally { db.close(); }
});

test("썸네일: 내용과 형식이 다르면 원본도 저장하지 않는다", async () => {
  const { db, objects, post } = await setup();
  try {
    expect((await post(photoForm(true, "image/jpeg"))).status).toBe(400);
    expect(objects.size).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM item_photos").get()).toEqual({ n: 0 });
  } finally { db.close(); }
});

test("썸네일 백필: 채우면 목록에서 빠지고, 다시 채우면 새 키로 바꾸고 옛 썸네일을 지운다", async () => {
  const { db, request, objects, user, admin, post, putThumb, missing } = await setup();
  try {
    const created = (await (await post(photoForm(false))).json()) as { id: number; url: string };

    const first = await putThumb(created.id);
    expect(first.status).toBe(200);
    const { thumb_url: firstThumb } = (await first.json()) as { thumb_url: string };
    expect(firstThumb).toMatch(/\.thumb\.png\?access=members$/);
    expect(await missing()).toEqual({ photos: [], total: 0 });
    expect(objects.size).toBe(2);

    const second = await putThumb(created.id);
    const { thumb_url: secondThumb } = (await second.json()) as { thumb_url: string };
    expect(secondThumb).not.toBe(firstThumb);
    expect(objects.size).toBe(2);
    expect((await request(firstThumb, { headers: { cookie: user } })).status).toBe(404);
    expect((await request(secondThumb, { headers: { cookie: user } })).status).toBe(200);

    // 없는 사진·다른 물품의 사진은 404
    expect((await putThumb(999)).status).toBe(404);
    db.exec("INSERT INTO items (id, name) VALUES (2, '다른 물품');");
    const other = await request(`/api/admin/items/2/photos/${created.id}/thumb`, {
      method: "PUT", headers: { origin: TEST_ORIGIN, cookie: admin }, body: thumbForm(),
    });
    expect(other.status).toBe(404);
  } finally { db.close(); }
});

test("썸네일: 사진 삭제와 물품 삭제가 원본과 썸네일을 함께 지운다", async () => {
  const { db, request, objects, admin, post } = await setup();
  try {
    const first = (await (await post(photoForm(true))).json()) as { id: number };
    await post(photoForm(true));
    expect(objects.size).toBe(4);

    const removed = await request(`/api/admin/items/1/photos/${first.id}`, {
      method: "DELETE", headers: { origin: TEST_ORIGIN, cookie: admin },
    });
    expect(removed.status).toBe(200);
    expect(objects.size).toBe(2);

    const deleted = await request("/api/admin/items/1", {
      method: "DELETE", headers: { origin: TEST_ORIGIN, cookie: admin },
    });
    expect(deleted.status).toBe(200);
    expect(objects.size).toBe(0);
  } finally { db.close(); }
});
