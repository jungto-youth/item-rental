import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const child = spawn(process.execPath, [
  fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "dev", "server/dev/index.ts", "--local", "--ip", "0.0.0.0", "--port", "8787",
], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, X_LOCAL_EXPLORER: "false", X_OBSERVABILITY_ENABLED: "false" },
});
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
