// 지회·모둠 — 회원 소속의 단일 출처. 웹과 서버가 같은 목록·검증을 쓴다.
// 저장은 members.affiliation 한 칸에 "서울 · 동부" 형태로 한다.
// (대여 스냅샷·관리자 화면이 이미 affiliation 문자열을 읽으므로 형식을 유지한다.)

export const AFFILIATION_GROUPS = {
  서울: ["동부", "서부", "남부", "북부"],
  경기: ["동부", "서부", "남부", "북부"],
  남부: ["충청", "대전/광주", "대구/경북", "부산/경남"],
} as const;

export type Branch = keyof typeof AFFILIATION_GROUPS;

export const BRANCHES = Object.keys(AFFILIATION_GROUPS) as Branch[];

// 화면 표시·저장 형식 — 이 구분자로 지회와 모둠을 나눈다.
const SEPARATOR = " · ";

// 선택 전(빈 지회)에도 같은 배열 참조를 돌려줘 select 가 불필요하게 다시 그려지지 않게 한다.
const NO_GROUPS: readonly string[] = [];

// 예전 저장값("서울지회 · 동부")도 읽을 수 있게 별칭을 둔다.
const LEGACY_BRANCHES: Record<string, Branch> = {
  서울지회: "서울",
  경기지회: "경기",
  남부지회: "남부",
};

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

// 저장·서버 검증의 유일한 판정 — 목록에 없는 조합은 거부한다.
// 예전 이름("서울지회")은 현재 이름("서울")으로 정규화해 받아들인다.
export function isValidAffiliationPair(branch: string, group: string): boolean {
  const canonical = canonicalBranch(branch);
  return canonical !== null && (AFFILIATION_GROUPS[canonical] as readonly string[]).includes(group);
}

export function formatAffiliation(branch: string, group: string): string {
  return `${canonicalBranch(branch) ?? branch}${SEPARATOR}${group}`;
}

// 기존 저장값을 선택 상태로 복원한다. 자유 입력·빈 값·잘못된 조합은 빈 선택으로.
export function parseAffiliation(value: string | null | undefined): {
  branch: Branch | "";
  group: string;
} {
  const parts = (value ?? "").split(SEPARATOR);
  if (parts.length !== 2) return { branch: "", group: "" };
  const canonical = canonicalBranch(parts[0]);
  if (!canonical || !isValidAffiliationPair(canonical, parts[1])) {
    return { branch: "", group: "" };
  }
  return { branch: canonical, group: parts[1] };
}

// 접근 가드·대여 신청 가드가 쓰는 완료 판정.
export function isAffiliationValid(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(SEPARATOR);
  return parts.length === 2 && isValidAffiliationPair(parts[0], parts[1]);
}
