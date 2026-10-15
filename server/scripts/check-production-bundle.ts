// Build locally and verify that the deployable Worker does not contain dev authentication.
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "item-rental-production-check-"));
try {
  const result = spawnSync(process.execPath,
    [join(root, "node_modules/wrangler/bin/wrangler.js"), "deploy", "--dry-run", "--outdir", output], {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.error);
    throw new Error("Production bundle build failed");
  }
  const bundle = await readFile(join(output, "index.js"), "utf8");
  const sourceMap = JSON.parse(await readFile(join(output, "index.js.map"), "utf8")) as { sources: string[] };
  const forbidden = ["createDevLoginRoute", "resolveDevelopmentSession", "ensureDevAdmin", "DEV_LOGIN_CODE", "LOCAL_TEST_LOGIN", "photo-test-admin@example.invalid", "/api/dev/login"];
  for (const marker of forbidden) {
    if (bundle.includes(marker)) throw new Error(`Development authentication leaked into production: ${marker}`);
  }
  if (sourceMap.sources.some(path => path.replaceAll("\\", "/").includes("server/dev/"))) {
    throw new Error("Development source included in the production dependency graph");
  }
  console.log("Production bundle verified: development login route and administrator bootstrap are absent");
} finally {
  await rm(output, { recursive: true, force: true });
}
