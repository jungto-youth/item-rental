// 로컬 개발 서버 두 개를 함께 띄운다.
// - web: Vite 개발 서버(5173) — 저장하면 HMR/전체 새로고침으로 즉시 반영
// - api: wrangler dev(8787) — /api 처리. 5173의 프록시가 여기로 넘긴다
//
// `a & b; wait` 방식은 Ctrl+C 를 눌렀을 때 자식 프로세스가 남아 포트를 계속
// 점유하는 일이 있다. 여기서는 두 프로세스를 직접 관리하고, 하나라도 죽으면
// 나머지도 함께 내린다.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const vite = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
const wrangler = fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url));

type Child = ReturnType<typeof spawn>;

const children: Child[] = [];
let shuttingDown = false;

function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  // 정상 종료하지 않는 프로세스가 있으면 잠시 뒤 강제 종료한다.
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    process.exit(code);
  }, 1_000).unref();
}

function run(label: string, bin: string, args: string[]) {
  const child = spawn(process.execPath, [bin, ...args], { cwd: root, stdio: "inherit" });
  children.push(child);
  child.on("error", (error) => {
    console.error(`[${label}] 실행 실패:`, error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${label}] 종료됨 (${signal ?? code}) — 나머지 개발 서버도 종료합니다`);
    shutdown(code ?? 1);
  });
  return child;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(0));
}

console.log("웹(HMR): http://localhost:5173   API: http://localhost:8787");
run("api", wrangler, ["dev"]);
run("web", vite, ["--port", "5173", "--strictPort"]);
