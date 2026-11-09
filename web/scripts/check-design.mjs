// 디자인 토큰 밖의 클래스를 잡는 정적 검사.
// 값의 단일 출처는 tokens.css 이고, 화면은 그 눈금만 쓴다.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");

// tokens.css 의 --space-* 와 1:1 대응하는 Tailwind 단계.
const SPACING_STEPS = new Set([
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "14",
]);

// tokens.css 의 --text-* 와 1:1 대응하는 px 값.
const TEXT_STEPS = new Set([
  "10",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "40",
  "48",
  "56",
  "64",
]);

const DEFAULT_TEXT_STEPS = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

const DEFAULT_PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

const SPACING_RE =
  /(?<![\w-])-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-([0-9]+(?:\.[0-9]+)?)(?![\w.-])/g;
const TEXT_RE = /(?<![\w-])text-([a-z0-9]+)(?![\w-])/g;
const LEADING_RE = /(?<![\w-])leading-(?!normal\b)[\w.[\]/-]+/g;
const DEFAULT_COLOR_RE = new RegExp(
  `(?<![\\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to)-${DEFAULT_PALETTE}-[0-9]{2,3}(?![\\w-])`,
  "g",
);
const ARBITRARY_HEX_RE =
  /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to)-\[#[0-9a-fA-F]{3,8}\](?![\w-])/g;

const violations = [];

function report(file, line, kind, value) {
  violations.push(`${path.relative(root, file)}:${line}  ${kind}: ${value}`);
}

function scan(file, source) {
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const lineNo = index + 1;

    for (const match of line.matchAll(SPACING_RE)) {
      if (!SPACING_STEPS.has(match[1])) {
        report(file, lineNo, "spacing", match[0]);
      }
    }

    for (const match of line.matchAll(TEXT_RE)) {
      const value = match[1];
      if (DEFAULT_TEXT_STEPS.has(value)) {
        report(file, lineNo, "type", match[0]);
      } else if (/^\d+$/.test(value) && !TEXT_STEPS.has(value)) {
        report(file, lineNo, "type", match[0]);
      }
    }

    for (const match of line.matchAll(LEADING_RE)) {
      report(file, lineNo, "line-height", match[0]);
    }

    for (const match of line.matchAll(DEFAULT_COLOR_RE)) {
      report(file, lineNo, "color", match[0]);
    }

    for (const match of line.matchAll(ARBITRARY_HEX_RE)) {
      report(file, lineNo, "color", match[0]);
    }
  });
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (entry.name.endsWith(".tsx")) {
      scan(full, await readFile(full, "utf8"));
    }
  }
}

await walk(srcDir);

if (violations.length > 0) {
  console.error("디자인 토큰 밖의 클래스가 있습니다:\n");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n총 ${violations.length}건 — tokens.css 의 눈금으로 바꿔 주세요.`);
  process.exit(1);
}

console.log("디자인 토큰 검사 통과");
