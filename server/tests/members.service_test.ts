// 회원 서비스 단위 테스트 — 마지막 관리자 보호 (DB 없이 Sql 스텁)
// 회귀 대상: 관리자 개수 세기가 UPDATE 와 분리된 COUNT-then-UPDATE 였고, deactivated_at
// 필터 누락으로 탈퇴 관리자가 재적돼 활성 관리자가 0이 됐던 버그. 두 결함 모두
// "가드가 UPDATE WHERE 절 안으로 들어간" 지금 구현에서 SQL 형태 단언으로 잡는다.
// 실제 SQL 동작(마지막 관리자 거절·승격 통과 등)은 sqlite 통합 테스트가 검증한다.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { withdrawMember, setMemberRole } from "../src/services/members.service.ts";
import { stubSql } from "./_stub.ts";

// 해임·탈퇴 가드 — 탈퇴 관리자는 개수에서 빠지고(self 제외) 자기 자신은 센다
const ACTIVE_ADMIN_GUARD =
  /x\.role = 'admin' AND x\.deactivated_at IS NULL\s+AND x\.id <> members\.id/;

Deno.test("withdrawMember: 가드 UPDATE가 활성 관리자 수를 원자 검사한다", async () => {
  const { db, calls } = stubSql({
    query: (text) =>
      /UPDATE members SET deactivated_at/.test(text) ? [{ id: "u" }] : [],
    batch: () => [],
  });

  assertEquals(await withdrawMember(db, "u"), { ok: true });

  const upd = calls[0];
  // now() 가 아니라 SQLite strftime 상수로 기록된다 (PLAN §6 규칙표)
  assertMatch(
    upd.text,
    /UPDATE members SET deactivated_at = strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/,
  );
  assert(
    ACTIVE_ADMIN_GUARD.test(upd.text),
    "가드에 활성 관리자 수 검사(자기 자신 제외)가 있어야 한다",
  );
  // 행을 지우지 않는다 — 대여 이력 보존이 전제
  assert(!upd.text.startsWith("DELETE"));
});

Deno.test("withdrawMember: 가드 0행이면 재조회로 last_admin을 구분한다", async () => {
  const { db } = stubSql({
    query: (text) => (/SELECT id FROM members/.test(text) ? [{ id: "a" }] : []),
    batch: () => [],
  });

  assertEquals(await withdrawMember(db, "a"), { error: "last_admin" });
});

Deno.test("withdrawMember: 없는 회원은 not_found", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [] });

  assertEquals(await withdrawMember(db, "x"), { error: "not_found" });
});

Deno.test("setMemberRole: 가드 UPDATE가 해임 시 다른 활성 관리자를 요구한다", async () => {
  const { db, calls } = stubSql({
    query: (text) => (/UPDATE members SET role/.test(text) ? [{ id: "a" }] : []),
    batch: () => [],
  });

  assertEquals(await setMemberRole(db, "a", "user"), { ok: true });

  const upd = calls[0];
  // 승격(?1 = 'admin')과 비관리자 대상(role <> 'admin')은 개수 검사 없이 통과
  assertMatch(upd.text, /\?1 = 'admin'\s+OR role <> 'admin'/);
  assert(
    ACTIVE_ADMIN_GUARD.test(upd.text),
    "해임 가드에 활성 관리자 수 검사가 있어야 한다",
  );
  assertEquals(upd.values, ["user", "a"]);
});

Deno.test("setMemberRole: 가드 0행이면 재조회로 last_admin을 구분한다", async () => {
  const { db } = stubSql({
    query: (text) => (/SELECT id FROM members/.test(text) ? [{ id: "a" }] : []),
    batch: () => [],
  });

  assertEquals(await setMemberRole(db, "a", "user"), { error: "last_admin" });
});

Deno.test("setMemberRole: 없는 회원은 not_found", async () => {
  const { db } = stubSql({ query: () => [], batch: () => [] });

  assertEquals(await setMemberRole(db, "x", "user"), { error: "not_found" });
});
