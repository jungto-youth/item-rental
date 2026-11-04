// 반납 상태 사진 — 업로드 권한·상태 가드·장수 제한·열람 권한·취소 정리를 HTTP 로 고정한다.
//
// 반납 사진은 회원이 직접 반납할 때의 자기신고를 증빙으로 바꾸는 기능이다.
// 저장 위치(R2 키), 응답 계약(return_photos), 열람 범위(본인·관리자)가 함께 움직이므로
// 라우트 경계에서 확인한다.
import { test, expect } from "vitest";
import { httpFixture, PNG, TEST_ORIGIN } from "./_http.fixture.ts";

const get = { origin: TEST_ORIGIN };

function photoForm(type = "image/png", name = "return.png") {
  const form = new FormData();
  form.set("file", new File([PNG], name, { type }));
  return form;
}

function upload(
  request: ReturnType<typeof httpFixture>["request"],
  cookie: string,
  reservationId: number,
  path = `/api/reservations/${reservationId}/photos`,
) {
  return request(path, {
    method: "POST",
    headers: { origin: TEST_ORIGIN, cookie },
    body: photoForm(),
  });
}

function seedRentals(db: ReturnType<typeof httpFixture>["db"]) {
  db.exec("INSERT INTO items (id, name, kind, total_qty) VALUES (1, '텐트', 'rental', 2);");
  db.exec(`INSERT INTO reservations (id, item_id, member_id, status, qty) VALUES
    (1, 1, 'owner', 'rented', 1),
    (3, 1, 'owner', 'pending', 1),
    (4, 1, 'owner', 'returned', 1);`);
}

test("반납 사진: 본인 + 대여 중이면 업로드되고 내 대여 응답에 들어간다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const owner = await member("owner");
    seedRentals(db);

    const res = await upload(request, owner, 1);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number; url: string };
    expect(created.url).toMatch(/^\/api\/photos\/reservations\/1\/.+\.png\?access=owner$/);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM reservation_photos WHERE reservation_id = 1").get() as { n: number }).n,
    ).toBe(1);

    const mine = await request("/api/reservations/mine", {
      headers: { cookie: owner, ...get },
    });
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as {
      reservations: { id: number; return_photos: { id: number; url: string; uploaded_role: string }[] }[];
    };
    const own = body.reservations.find((row) => row.id === 1)!;
    expect(own.return_photos).toHaveLength(1);
    expect(own.return_photos[0]).toMatchObject({
      id: created.id,
      uploaded_role: "member",
    });
    // 사진이 없는 건은 빈 배열이 계약이다 (null 아님)
    const pending = body.reservations.find((row) => row.id === 3)!;
    expect(pending.return_photos).toEqual([]);
  } finally {
    db.close();
  }
});

test("반납 사진: 남의 건·대여 중이 아닌 건은 업로드할 수 없다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const owner = await member("owner");
    const other = await member("other");
    seedRentals(db);

    // 남의 대여 — 존재 여부를 흘리지 않게 404
    expect((await upload(request, other, 1)).status).toBe(404);
    // 신청 대기·반납 완료 — 상태 전이 대상이 아니므로 409
    expect((await upload(request, owner, 3)).status).toBe(409);
    expect((await upload(request, owner, 4)).status).toBe(409);

    // 3장까지 — 4번째는 거절
    for (let i = 0; i < 3; i++) {
      expect((await upload(request, owner, 1)).status).toBe(201);
    }
    const fourth = await upload(request, owner, 1);
    expect(fourth.status).toBe(409);
    expect((db.prepare("SELECT COUNT(*) AS n FROM reservation_photos WHERE reservation_id = 1").get() as { n: number }).n).toBe(3);
  } finally {
    db.close();
  }
});

test("반납 사진: 관리자는 남의 대여에도 확인 사진을 남기고 역할이 구분된다", async () => {
  const { db, request, member } = httpFixture();
  try {
    const admin = await member("admin", "admin");
    await member("owner");
    seedRentals(db);

    const res = await upload(
      request,
      admin,
      1,
      "/api/admin/reservations/1/photos",
    );
    expect(res.status).toBe(201);
    expect(
      (db.prepare("SELECT uploaded_role, uploaded_by FROM reservation_photos WHERE reservation_id = 1").get() as {
        uploaded_role: string;
        uploaded_by: string;
      }),
    ).toMatchObject({ uploaded_role: "admin", uploaded_by: "admin" });

    const list = await request("/api/admin/reservations", {
      headers: { cookie: admin, ...get },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      reservations: { id: number; return_photos: { uploaded_role: string }[] }[];
    };
    expect(body.reservations.find((row) => row.id === 1)?.return_photos).toEqual([
      expect.objectContaining({ uploaded_role: "admin" }),
    ]);
  } finally {
    db.close();
  }
});

test("반납 사진: 열람은 본인과 관리자만 가능하고 타인은 404", async () => {
  const { db, request, member, objects } = httpFixture();
  try {
    const owner = await member("owner");
    const other = await member("other");
    const admin = await member("admin", "admin");
    seedRentals(db);

    const created = (await (await upload(request, owner, 1)).json()) as { url: string };
    expect(objects.size).toBe(1);

    const own = await request(created.url, { headers: { cookie: owner } });
    expect(own.status).toBe(200);
    // 물품 사진과 달리 캐시하지 않는다 — 권한이 바뀌면 바로 볼 수 없어야 한다
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await request(created.url, { headers: { cookie: admin } })).status).toBe(200);
    expect((await request(created.url, { headers: { cookie: other } })).status).toBe(404);
    expect((await request(created.url)).status).toBe(401);
  } finally {
    db.close();
  }
});

test("반납 사진: 대여 중에는 회원이 삭제할 수 있고, 반납 후에는 관리자만 정정한다", async () => {
  const { db, request, member, objects } = httpFixture();
  try {
    const owner = await member("owner");
    const admin = await member("admin", "admin");
    seedRentals(db);

    const first = (await (await upload(request, owner, 1)).json()) as { id: number };
    const removed = await request(`/api/reservations/1/photos/${first.id}`, {
      method: "DELETE",
      headers: { cookie: owner, ...get },
    });
    expect(removed.status).toBe(200);
    expect(objects.size).toBe(0);

    const second = (await (await upload(request, owner, 1)).json()) as { id: number };
    const returned = await request("/api/reservations/1/return", {
      method: "POST",
      headers: { cookie: owner, ...get },
    });
    expect(returned.status).toBe(200);

    // 반납 후에는 이력 증빙 — 회원 삭제 불가, 관리자 정정 가능
    expect(
      (await request(`/api/reservations/1/photos/${second.id}`, {
        method: "DELETE",
        headers: { cookie: owner, ...get },
      })).status,
    ).toBe(404);
    expect(
      (await request(`/api/admin/reservations/1/photos/${second.id}`, {
        method: "DELETE",
        headers: { cookie: admin, ...get },
      })).status,
    ).toBe(200);
    expect(objects.size).toBe(0);
  } finally {
    db.close();
  }
});

test("반납 사진: 대여 취소 시 남아 있던 사진과 R2 객체를 정리한다", async () => {
  const { db, request, member, objects } = httpFixture();
  try {
    const owner = await member("owner");
    seedRentals(db);

    expect((await upload(request, owner, 1)).status).toBe(201);
    expect(objects.size).toBe(1);

    const cancelled = await request("/api/reservations/1/cancel", {
      method: "POST",
      headers: { cookie: owner, ...get },
    });
    expect(cancelled.status).toBe(200);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM reservation_photos WHERE reservation_id = 1").get() as { n: number }).n,
    ).toBe(0);
    expect(objects.size).toBe(0);
  } finally {
    db.close();
  }
});
