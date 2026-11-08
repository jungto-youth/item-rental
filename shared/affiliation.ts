// 지부·지회·모둠 — 회원 소속의 단일 출처. 웹과 서버가 같은 목록·검증을 쓴다.
// 저장은 members.affiliation 한 칸에 "청년지부 · 서울 · 동부" 형태로 한다.
// 대중지부는 고정 목록이 없어 지회·모둠을 자유 입력한다.
// (대여 스냅샷·관리자 화면이 이미 affiliation 문자열을 읽으므로 한 칸 형식을 유지한다.)

export const DIVISIONS = ["청년지부", "대중지부"] as const;

export type Division = (typeof DIVISIONS)[number];

export const AFFILIATION_GROUPS = {
  서울: ["동부", "서부", "남부", "북부"],
  경기: ["동부", "서부", "남부", "북부"],
  남부: ["충청", "대전/광주", "대구/경북", "부산/경남"],
} as const;

export type Branch = keyof typeof AFFILIATION_GROUPS;

export const BRANCHES = Object.keys(AFFILIATION_GROUPS) as Branch[];

// 자유 입력 파트(지회·모둠)의 최대 길이 — 저장·표시가 한 줄로 유지되게 짧게 둔다.
export const AFFILIATION_PART_MAX = 20;

// 화면 표시·저장 형식 — 이 구분자로 지부·지회·모둠을 나눈다.
const SEPARATOR = " · ";

// 선택 전(빈 지회)에도 같은 배열 참조를 돌려줘 select 가 불필요하게 다시 그려지지 않게 한다.
const NO_GROUPS: readonly string[] = [];

// 예전 저장값("서울지회 · 동부")도 읽을 수 있게 별칭을 둔다.
const LEGACY_BRANCHES: Record<string, Branch> = {
  서울지회: "서울",
  경기지회: "경기",
  남부지회: "남부",
};

export function isDivision(value: unknown): value is Division {
  return typeof value === "string" && (DIVISIONS as readonly string[]).includes(value);
}

export function isBranch(value: unknown): value is Branch {
  return typeof value === "string" && value in AFFILIATION_GROUPS;
}

function canonicalBranch(value: string): Branch | null {
  if (isBranch(value)) return value;
  return LEGACY_BRANCHES[value] ?? null;
}

export function groupsOf(branch: string): readonly string[] {
  const canonical = canonicalBranch(branch);
  return canonical ? AFFILIATION_GROUPS[canonical] : NO_GROUPS;
}

// 청년지부의 고정 조합 검증 — 목록에 없는 지회·모둠 조합은 거부한다.
export function isValidAffiliationPair(branch: string, group: string): boolean {
  const canonical = canonicalBranch(branch);
  return canonical !== null && (AFFILIATION_GROUPS[canonical] as readonly string[]).includes(group);
}

export type CustomPartIssue = "required" | "too_long" | "separator" | "invalid";

// 대중지부의 자유 입력 파트 검증 — 저장 구분자와 줄바꿈은 허용하지 않는다.
export function customPartIssue(value: string): CustomPartIssue | null {
  const text = value.trim();
  if (!text) return "required";
  if (text.length > AFFILIATION_PART_MAX) return "too_long";
  if (text.includes("·")) return "separator";
  if (/[\u0000-\u001F\u007F\u2028\u2029]/.test(text)) return "invalid";
  return null;
}

// 저장·서버 검증의 유일한 판정.
export function isValidAffiliation(division: string, branch: string, group: string): boolean {
  if (division === "청년지부") return isValidAffiliationPair(branch, group);
  if (division === "대중지부")
    return customPartIssue(branch) === null && customPartIssue(group) === null;
  return false;
}

// 저장 문자열은 항상 3단이다. 청년지부의 옛 지회 표기는 현재 이름으로 정규화한다.
export function formatAffiliation(division: string, branch: string, group: string): string {
  const head = division.trim();
  const middle = division === "청년지부" ? (canonicalBranch(branch) ?? branch.trim()) : branch.trim();
  return `${head}${SEPARATOR}${middle}${SEPARATOR}${group.trim()}`;
}

export type ParsedAffiliation = {
  division: Division | "";
  branch: string;
  group: string;
};

const EMPTY: ParsedAffiliation = { division: "", branch: "", group: "" };

// 기존 저장값을 선택 상태로 복원한다.
// - 3단: 지부 · 지회 · 모둠
// - 2단(0015 이전 값): 모두 청년지부였으므로 청년지부로 해석한다.
// 자유 입력·빈 값·잘못된 조합은 빈 선택으로.
export function parseAffiliation(value: string | null | undefined): ParsedAffiliation {
  const parts = (value ?? "").split(SEPARATOR);

  if (parts.length === 3) {
    const division = parts[0].trim();
    const branch = parts[1].trim();
    const group = parts[2].trim();
    if (!isDivision(division)) return EMPTY;
    if (division === "청년지부") {
      const canonical = canonicalBranch(branch);
      if (!canonical || !isValidAffiliationPair(canonical, group)) return EMPTY;
      return { division, branch: canonical, group };
    }
    if (!isValidAffiliation(division, branch, group)) return EMPTY;
    return { division, branch, group };
  }

  if (parts.length === 2) {
    const branch = parts[0].trim();
    const group = parts[1].trim();
    const canonical = canonicalBranch(branch);
    if (!canonical || !isValidAffiliationPair(canonical, group)) return EMPTY;
    return { division: "청년지부", branch: canonical, group };
  }

  return EMPTY;
}

// 접근 가드·대여 신청 가드가 쓰는 완료 판정.
export function isAffiliationValid(value: string | null | undefined): boolean {
  return parseAffiliation(value).division !== "";
}
