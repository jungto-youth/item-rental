// design/partials/<name>.html 내용을 각 페이지의 마커 사이에 채운다.
//
//   <!-- @begin footer -->
//   <!-- @end footer -->
//
// 마커 이름 뒤에 붙인 토큰은 partial 의 {{class}} 자리에 그대로 들어간다.
//
//   <!-- @begin footer -->
//   <!-- @begin footer bg-surface -->
//
// 시안은 빌드 없이 file:// 로 열려야 하므로 fetch 주입을 쓸 수 없다. 대신 완성된
// 정적 HTML 을 미리 만들어 두고, 마커는 남겨 두어 몇 번을 실행해도 같은 결과가
// 나오게 한다(마커를 소비하지 않는다). 생성 영역은 마커 안쪽뿐이다.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLASS_TOKEN = "{{class}}";

const dir = dirname(fileURLToPath(import.meta.url));
const partialsDir = join(dir, "partials");
const checkOnly = process.argv.includes("--check");

const partials = new Map<string, string>();
for (const file of await readdir(partialsDir)) {
  if (!file.endsWith(".html")) continue;
  const name = file.slice(0, -".html".length);
  const source = await readFile(join(partialsDir, file), "utf8");
  // 끝의 빈 줄은 버린다 — 블록을 채울 때 줄바꿈은 빌더가 붙인다.
  partials.set(name, source.replace(/\n+$/, ""));
}

// 들여쓰기(1)를 캡처해 같은 깊이의 닫는 마커까지만 한 블록으로 본다.
// 마커 이름 뒤 토큰(3)은 partial 의 {{class}} 로 전달된다.
const BLOCK = /^([ \t]*)<!-- @begin (\S+)(?: ([^>]*?))? -->\n[\s\S]*?^\1<!-- @end \2 -->$/gm;

const pages = (await readdir(dir)).filter((file) => file.endsWith(".html")).sort();
const stale: string[] = [];
let failed = false;

for (const page of pages) {
  const path = join(dir, page);
  const source = await readFile(path, "utf8");
  let matched = 0;

  const next = source.replace(
    BLOCK,
    (whole, indent: string, name: string, rawArgs: string | undefined) => {
      matched++;
      const partial = partials.get(name);
      if (partial === undefined) {
        console.error(`✗ ${page}: partial "${name}" 파일이 없습니다`);
        failed = true;
        return whole;
      }

      const args = (rawArgs ?? "").trim().replace(/\s+/g, " ");
      if (args !== "" && !partial.includes(CLASS_TOKEN)) {
        console.error(`✗ ${page}: "${name}" partial 은 인자를 받지 않습니다({{class}} 없음): ${args}`);
        failed = true;
        return whole;
      }

      const filled = partial.replaceAll(CLASS_TOKEN, args === "" ? "" : ` ${args}`);
      // partial 은 들여쓰기 0 으로 쓰여 있다. 마커 깊이에 맞춰 다시 들여쓴다.
      const body = filled
        .split("\n")
        .map((line) => (line.trim() === "" ? "" : indent + line))
        .join("\n");
      const head = args === "" ? name : `${name} ${args}`;
      return `${indent}<!-- @begin ${head} -->\n${body}\n${indent}<!-- @end ${name} -->`;
    },
  );

  // 짝이 맞지 않는 @begin 이 남아 있으면 조용히 지나가지 않는다.
  const begins = source.match(/<!-- @begin /g)?.length ?? 0;
  if (begins !== matched) {
    console.error(`✗ ${page}: @begin 마커 ${begins}개 중 ${matched}개만 짝을 찾았습니다`);
    failed = true;
    continue;
  }

  if (next === source) continue;
  stale.push(page);
  if (!checkOnly) await writeFile(path, next);
}

if (failed) process.exit(1);

if (checkOnly) {
  if (stale.length > 0) {
    console.error(`✗ 생성 결과가 오래됐습니다: ${stale.join(", ")}`);
    console.error("  node design/build.ts 를 실행하세요");
    process.exit(1);
  }
  console.log(`✓ design/ 마커 최신 (${pages.length}개 파일)`);
} else {
  console.log(stale.length === 0 ? "✓ 변경 없음" : `✓ ${stale.length}개 갱신: ${stale.join(", ")}`);
}
