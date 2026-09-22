// 회원 서비스 단위 테스트 — 마지막 관리자 보호 (DB 없이 Sql 스텁)
// 회귀 대상: setMemberRole의 관리자 개수 세기에 deactivated_at 필터가 누락되어,
// 탈퇴된 관리자가 재적돼 유일한 활성 관리자도 해임 가능했던 버그.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { withdrawMember, setMemberRole } from "../src/services/members.service.ts";
import { stubSql } from "./_stub.ts";

type Member = { id: string; role: string; deactivated_at: string | null };

// 관리자 목록을 시뮬레이션하는 DB — role/role+deactivated 카운트 쿼리만 실제로 센다
function memberDb(members: Member[]) {
  const activeAdmins = members.filter(
    (m) => m.role === "admin" && m.deactivated_at === null,
  ).length;
  return stubSql({
    query: (text, values) => {
      if (/SELECT id, role FROM members WHERE id = \$1/.test(text)) {
        return members.filter((m) => m.id === values[0]);
      }
      if (/COUNT\(\*\)/.test(text)) {
        // 개수 쿼리는 deactivated_at IS NULL 필터의 존재를 기준으로 정답을 냄
        const filtered = /deactivated_at IS NULL/.test(text);
        const n = filtered
          ? activeAdmins
          : members.filter((m) => m.role === "admin").length;
        return [{ n }];
      }
      if (/UPDATE members SET deactivated_at/.test(text)) {
        const m = members.find((m) => m.id === values[0]);
        if (m) m.deactivated_at = "now";
        return [{ id: values[0] }];
      }
      if (/UPDATE members SET role/.test(text)) {
        const m = members.find((m) => m.id === values[1]);
        if (m) m.role = String(values[0]);
        return [{ id: values[1] }];
      }
      return [];
    },
    transaction: () => [],
  });
}

Deno.test("withdrawMember: 마지막 활성 관리자 탈퇴는 last_admin으로 거부된다", async () => {
  // 같은 조건: 탈퇴된 관리자 1명 + 활성 관리자 1명(마지막)
  const db = memberDb([
    { id: "a", role: "admin", deactivated_at: null },
    { id: "b", role: "admin", deactivated_at: "2026-01-01" },
    { id: "u", role: "user", deactivated_at: null },
  ]);

  assertEquals(await withdrawMember(db, "a"), { error: "last_admin" });
});

Deno.test("withdrawMember: 관리자 2명이면 탈퇴를 허용한다", async () => {
  const db = memberDb([
    { id: "a", role: "admin", deactivated_at: null },
    { id: "b", role: "admin", deactivated_at: null },
  ]);

  assertEquals(await withdrawMember(db, "a"), { ok: true });
});

Deno.test("withdrawMember: 일반 회원은 개수 검사 없이 탈퇴된다", async () => {
  const { db } = memberDb([
    { id: "u", role: "user", deactivated_at: null },
  ]);

  assertEquals(await withdrawMember(db, "u"), { ok: true });
});

Deno.test("setMemberRole: 탈퇴 관리자가 재적돼도 마지막 활성 관리자 해임은 거부된다", async () => {
  // 버그 상황 — 개수 쿼리에 deactivated_at IS NULL 이 없으면 전체 관리자 2명으로 세어
  // { ok: true } 를 돌려 활성 관리자가 0명이 됐다
  const db = memberDb([
    { id: "a", role: "admin", deactivated_at: null },
    { id: "b", role: "admin", deactivated_at: "2026-01-01" },
  ]);

  assertEquals(await setMemberRole(db, "a", "user"), { error: "last_admin" });
});

Deno.test("setMemberRole: 해임 개수 쿼리는 활성 관리자만 센다 (SQL 단언)", async () => {
  const { db, calls } = stubSql({
    query: (text, values) => {
      if (/SELECT id, role FROM members/.test(text)) {
        return [{ id: String(values[0]), role: "admin" }];
      }
      if (/COUNT\(\*\)/.test(text)) return [{ n: 2 }];
      if (/UPDATE members SET role/.test(text)) return [{ id: values[1] }];
      return [];
    },
    transaction: () => [],
  });

  assertEquals(await setMemberRole(db, "a", "user"), { ok: true });

  const count = calls.find((c) => /COUNT\(\*\)/.test(c.text));
  assertEquals(
    count && /deactivated_at IS NULL/.test(count.text),
    true,
    "관리자 개수 쿼리에 deactivated_at IS NULL 필터가 있어야 한다",
  );
});

Deno.test("setMemberRole: 없는 회원은 not_found", async () => {
  const db = memberDb([]);
  assertEquals(await setMemberRole(db, "x", "user"), { error: "not_found" });
});

Deno.test("withdrawMember: 탈퇴 UPDATE는 소프트 삭제(deactivated_at)만 기록한다", async () => {
  const { db, calls } = stubSql({
    query: (text, values) => {
      if (/SELECT id, role FROM members/.test(text)) {
        return [{ id: String(values[0]), role: "user" }];
      }
      if (/COUNT\(\*\)/.test(text)) return [{ n: 0 }];
      if (/UPDATE members SET deactivated_at/.test(text)) return [{ id: values[0] }];
      return [];
    },
    transaction: () => [],
  });

  assertEquals(await withdrawMember(db, "u"), { ok: true });
  assertMatch(calls[1].text, /UPDATE members SET deactivated_at = now\(\)/);
  // 행을 지우지 않는다 — 대여 이력 보존이 전제
  assert(!calls[1].text.startsWith("DELETE"));
});
