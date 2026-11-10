// 응답 뒤에 실행할 작업 — 알림처럼 실패해도 응답을 바꾸지 않아야 하는 일에 쓴다.
// ExecutionContext 가 없는 환경(단위 테스트·스크립트)에서는 그냥 실행하고 결과를 버린다.
import type { Context } from "hono";
import type { Bindings, Variables } from "./types";

export type AppContext = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;

export function runInBackground(
  c: AppContext,
  work: () => Promise<unknown>,
): void {
  const task = work().catch((err) => {
    console.error("background task failed", err);
  });
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // ExecutionContext 가 없는 환경 — task 는 그대로 진행되고 결과만 버려진다.
  }
}
