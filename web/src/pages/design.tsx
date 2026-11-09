import { For, Show, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import { APP_NAME, APP_NAME_SHORT } from "../brand";
import type { Item } from "../types";
import { BrandLogo } from "../components/brand-logo";
import {
  AlertIcon,
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  ImageIcon,
  PlusIcon,
  SearchIcon,
} from "../components/icons";
import { ReservationRow } from "../components/common/reservation-row";
import { RentalSteps } from "../components/features/item/rental-steps";
import { ItemCard } from "../components/features/item/item-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Chip } from "../components/ui/chip";
import { DocPage } from "../components/ui/doc-page";
import { Empty } from "../components/ui/empty";
import { InfoList } from "../components/ui/info-list";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Notice } from "../components/ui/notice";
import { PageHeader } from "../components/ui/page-header";
import { Select } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { Tag } from "../components/ui/tag";
import { TextButton } from "../components/ui/text-button";

// ===== 기초 =====
const PRINCIPLES = [
  {
    title: "조용함",
    body: "장식용 그림자·그라데이션·큰 색면을 쓰지 않습니다. 카드와 입력은 1px 테두리로 구분합니다.",
  },
  {
    title: "빠른 스캔",
    body: "사진 → 이름 → 위치 → 대여 가능 수량 순서로 읽힙니다. 상태는 점과 텍스트로 함께 말합니다.",
  },
  {
    title: "명확한 행동",
    body: "화면마다 주 행동은 하나입니다. 빈 상태와 오류는 항상 다음 행동을 제안합니다.",
  },
];

// ===== 색 =====
const COLOR_GROUPS = [
  {
    name: "잉크",
    note: "텍스트",
    tokens: [
      { name: "ink-1", value: "#111827", use: "제목·본문" },
      { name: "ink-2", value: "#4b5563", use: "보조 설명·라벨" },
      { name: "ink-3", value: "#9ca3af", use: "비활성·아이콘" },
    ],
  },
  {
    name: "면",
    note: "배경",
    tokens: [
      { name: "bg", value: "#f6f7f9", use: "페이지 바탕" },
      { name: "surface", value: "#ffffff", use: "카드·입력" },
      { name: "surface-muted", value: "#f3f4f6", use: "사진 자리·호버" },
    ],
  },
  {
    name: "경계",
    note: "선",
    tokens: [
      { name: "border", value: "#e5e7eb", use: "1px 헤어라인" },
      { name: "border-strong", value: "#d1d5db", use: "입력 경계" },
    ],
  },
  {
    name: "액션",
    note: "오렌지",
    tokens: [
      { name: "primary", value: "#ea580c", use: "액션·선택" },
      { name: "primary-strong", value: "#c2410c", use: "채운 버튼" },
      { name: "primary-deep", value: "#9a3412", use: "hover·눌림" },
      { name: "primary-soft", value: "#fff1e8", use: "연한 강조 면" },
    ],
  },
  {
    name: "상태",
    note: "앰버·레드",
    tokens: [
      { name: "warning", value: "#b45309", use: "수리 중·승인 대기" },
      { name: "warning-soft", value: "#fffbeb", use: "경고 면" },
      { name: "danger", value: "#dc2626", use: "오류·삭제·거절" },
      { name: "danger-soft", value: "#fef2f2", use: "오류 면" },
    ],
  },
];

const FLAT_COLORS = COLOR_GROUPS.flatMap((group) => group.tokens);

// ===== 타이포 =====
const TYPE_SCALE = [
  {
    token: "text-64",
    size: "64px",
    weight: "700",
    role: "표시용 대형",
    sample: "가나다 Aa",
    className: "text-64 font-bold tracking-tight",
  },
  {
    token: "text-56",
    size: "56px",
    weight: "700",
    role: "표시용",
    sample: "가나다 Aa",
    className: "text-56 font-bold tracking-tight",
  },
  {
    token: "text-48",
    size: "48px",
    weight: "700",
    role: "표시용",
    sample: "가나다 Aa",
    className: "text-48 font-bold tracking-tight",
  },
  {
    token: "text-40",
    size: "40px",
    weight: "700",
    role: "표시용",
    sample: "가나다 Aa",
    className: "text-40 font-bold tracking-tight",
  },
  {
    token: "text-32",
    size: "32px",
    weight: "700",
    role: "히어로 제목",
    sample: "물품 현황",
    className: "text-32 font-bold tracking-tight",
  },
  {
    token: "text-28",
    size: "28px",
    weight: "600",
    role: "큰 제목",
    sample: "물품 현황",
    className: "text-28 font-semibold tracking-tight",
  },
  {
    token: "text-24",
    size: "24px",
    weight: "700",
    role: "페이지 제목",
    sample: "물품 현황",
    className: "text-24 font-bold tracking-tight",
  },
  {
    token: "text-20",
    size: "20px",
    weight: "600",
    role: "섹션 제목",
    sample: "현재 대여 중",
    className: "text-20 font-semibold tracking-tight",
  },
  {
    token: "text-16",
    size: "16px",
    weight: "400",
    role: "본문·입력",
    sample: "신청 후 관리자가 승인하면 대여가 시작됩니다.",
    className: "text-16 font-normal",
  },
  {
    token: "text-14",
    size: "14px",
    weight: "400",
    role: "캡션·라벨·버튼",
    sample: "관리자가 승인하면 대여가 시작됩니다.",
    className: "text-14 font-normal",
  },
  {
    token: "text-12",
    size: "12px",
    weight: "400",
    role: "칩·배지·보조 캡션",
    sample: "관리자가 승인하면 대여가 시작됩니다.",
    className: "text-12 font-normal",
  },
  {
    token: "text-10",
    size: "10px",
    weight: "500",
    role: "최소 라벨",
    sample: "관리자가 승인하면 대여가 시작됩니다.",
    className: "text-10 font-medium",
  },
];

// ===== 간격·형태 =====
const SPACING = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 56];

const RADII = [
  { token: "rounded-card", value: "8px", use: "버튼·카드·모달", radius: "8px" },
  { token: "rounded-pill", value: "999px", use: "칩·배지·아바타", radius: "999px" },
];

const LAYOUTS = [
  { token: "layout-max", value: "1280px", use: "헤더·본문·푸터 공통" },
  { token: "layout-form", value: "720px", use: "폼·계정 카드" },
  { token: "layout-onboarding", value: "400px", use: "로그인·프로필 등록" },
  { token: "layout-doc", value: "1280px", use: "정책·디자인 문서 셸" },
];

const BREAKPOINTS = [
  { name: "sm", value: "640px", use: "그리드 3열" },
  { name: "md", value: "768px", use: "헤더 64px·본문 패딩 16px·그리드 4열" },
  { name: "lg", value: "1024px", use: "2열 셸·보조 패널 표시" },
  { name: "xl", value: "1280px", use: "그리드 5열" },
];

// ===== 컴포넌트 예시 =====
const CHIP_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "available", label: "대여 가능" },
  { value: "reserved", label: "예약 가능" },
  { value: "rented", label: "대여 중" },
  { value: "repair", label: "수리 중" },
];

const BADGE_KINDS = [
  "available",
  "reserved",
  "unavailable",
  "repair",
  "overdue",
  "pending",
  "rejected",
  "returned",
  "cancelled",
  "retired",
  "user",
  "admin",
];

const ICONS = [
  { name: "추가", Icon: PlusIcon },
  { name: "검색", Icon: SearchIcon },
  { name: "펼치기", Icon: ChevronDownIcon },
  { name: "뒤로", Icon: ChevronLeftIcon },
  { name: "완료", Icon: CheckIcon },
  { name: "알림", Icon: AlertIcon },
  { name: "물품", Icon: BoxIcon },
  { name: "사진", Icon: ImageIcon },
  { name: "닫기", Icon: CloseIcon },
];

const SAMPLE_ITEMS: Item[] = [
  {
    id: 1,
    name: "캠핑 텐트 4인용",
    lifecycle: "active",
    total_qty: 2,
    rentable_qty: 2,
    qty_repair: 0,
    kind: "rental",
    location: "지하 창고 B-2",
    description: null,
    photos: [],
    availability_badge: "available",
    active_now: 0,
    pending_qty: 0,
    reserved_qty: 0,
    categories: [{ id: 1, name: "야외" }],
  },
  {
    id: 2,
    name: "전동 드릴",
    lifecycle: "active",
    total_qty: 1,
    rentable_qty: 0,
    qty_repair: 1,
    kind: "rental",
    location: "공구함",
    description: null,
    photos: [],
    availability_badge: "repair",
    active_now: 0,
    pending_qty: 0,
    reserved_qty: 0,
    categories: [{ id: 2, name: "공구" }],
  },
];

// ===== 접근성 =====
const DO_LIST = [
  "주 행동은 화면당 하나만 primary로 둡니다.",
  "상태는 점 + 텍스트로 함께 표시합니다.",
  "빈 상태와 오류에는 다음 행동을 붙입니다.",
  "포커스는 2px outline으로 항상 보이게 합니다.",
  "터치 타깃은 최소 24×24px, 주요 컨트롤은 32–40px.",
];

const DONT_LIST = [
  "장식용 그림자·그라데이션·큰 색면을 쓰지 않습니다.",
  "컴포넌트에 hex 값을 직접 쓰지 않습니다.",
  "간격 눈금(2·4·6·8·12·16·20·24·32·40·48·56px) 밖의 값을 만들지 않습니다.",
  "10px 미만 글자로 정보를 숨기지 않습니다.",
  "색만으로 상태를 구분하지 않습니다.",
];

// ===== 작은 표현 =====
function Meta(props: { label: string; value: string }) {
  return (
    <div>
      <dt class="m-0 text-fine leading-normal text-ink-2">{props.label}</dt>
      <dd class="m-0 mt-1 text-fine leading-normal font-semibold text-ink-1 tabular-nums">
        {props.value}
      </dd>
    </div>
  );
}

function Section(props: {
  id: string;
  title: string;
  meta?: string;
  intro?: string;
  children?: JSX.Element;
}) {
  return (
    <section class="min-w-0">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          data-toc
          id={props.id}
          class="m-0 scroll-mt-24 text-heading leading-normal font-semibold tracking-tight text-ink-1"
        >
          {props.title}
        </h2>
        <Show when={props.meta}>
          <span class="text-fine leading-normal text-ink-2 tabular-nums">
            {props.meta}
          </span>
        </Show>
      </div>
      <Show when={props.intro}>
        <p class="mt-2 max-w-[64ch] text-fine leading-normal text-ink-2">
          {props.intro}
        </p>
      </Show>
      <div class="mt-6">{props.children}</div>
    </section>
  );
}

function Spec(props: { name: string; note: string; children?: JSX.Element }) {
  return (
    <div class="grid gap-4 py-4 first:pt-0 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
          {props.name}
        </h3>
        <p class="mt-1 text-fine leading-normal text-ink-2">{props.note}</p>
      </div>
      <div class="min-w-0">{props.children}</div>
    </div>
  );
}

function Label(props: { children?: JSX.Element }) {
  return (
    <p class="mb-2 text-fine leading-normal font-medium text-ink-2">
      {props.children}
    </p>
  );
}

// 기초 섹션 안에서 색·타이포·간격을 묶는 하위 블록.
// 상위 Section 을 늘리지 않아 목차와 제목 구조가 단순해진다.
function Block(props: {
  label: string;
  intro?: string;
  children?: JSX.Element;
}) {
  return (
    <div class="mt-8">
      <Label>{props.label}</Label>
      <Show when={props.intro}>
        <p class="mb-4 max-w-[64ch] text-fine leading-normal text-ink-2">
          {props.intro}
        </p>
      </Show>
      {props.children}
    </div>
  );
}

export default function Design() {
  const [busy, setBusy] = createSignal(false);
  const [chip, setChip] = createSignal("all");
  const [modalOpen, setModalOpen] = createSignal(false);

  return (
    <DocPage
      title="디자인 시스템"
      subtitle={`${APP_NAME}의 화면을 이루는 토큰과 컴포넌트를 한곳에 모았습니다. 이 페이지는 실제 컴포넌트로만 만들었고, 값의 출처는 tokens.css입니다.`}
      tocLabel="디자인 시스템 목차"
    >
      {/* 브랜드 · 팔레트 — 컨텐츠 첫머리에서 서비스의 인상과 토큰을 함께 보여준다. */}
      <div class="grid gap-4 pb-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <BrandLogo />
            <span class="text-fine font-semibold text-ink-1">
              {APP_NAME_SHORT}
            </span>
          </div>
          <span class="text-fine text-ink-2">로고 · 팔레트</span>
        </div>
        <div
          class="flex h-8 overflow-hidden rounded-card border border-line"
          aria-hidden="true"
        >
          <For each={FLAT_COLORS}>
            {(color) => (
              <div
                class="min-w-0 flex-1"
                style={{ "background-color": color.value }}
              />
            )}
          </For>
        </div>
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Meta label="화면" value="12개 경로" />
          <Meta label="색" value="16개 토큰" />
          <Meta label="타이포" value="12단계" />
          <Meta label="간격" value="2px 눈금" />
        </dl>
      </div>

      <div class="mt-10 grid gap-8">
        <Section
          id="foundation"
          title="기초"
          meta="토큰 · 원칙"
          intro="따뜻한 중립 회색 바탕, 흰 카드, 잉크 텍스트, 오렌지 포인트. 아래 색·타이포·간격 값의 출처는 tokens.css입니다."
        >
          <div class="grid gap-6 sm:grid-cols-3">
            <For each={PRINCIPLES}>
              {(principle) => (
                <div class="pt-3">
                  <h3 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
                    {principle.title}
                  </h3>
                  <p class="mt-2 text-fine leading-normal text-ink-2">
                    {principle.body}
                  </p>
                </div>
              )}
            </For>
          </div>
          <Block
            label="색 · 16개 토큰"
            intro="새 색은 토큰에 먼저 추가하고 컴포넌트에는 hex를 직접 쓰지 않습니다. 오렌지는 주 행동과 선택에만, 빨강은 오류와 파괴적 행동에만 씁니다."
          >
          <div class="grid gap-8">
            <For each={COLOR_GROUPS}>
              {(group) => (
                <div class="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6">
                  <div>
                    <p class="m-0 text-fine font-semibold text-ink-1">
                      {group.name}
                    </p>
                    <p class="mt-1 text-fine text-ink-2">{group.note}</p>
                  </div>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    <For each={group.tokens}>
                      {(token) => (
                        <div class="min-w-0">
                          <div
                            class="h-12 rounded-card border border-line"
                            style={{ "background-color": token.value }}
                          />
                          <p class="mt-2 truncate text-fine font-semibold text-ink-1">
                            {token.name}
                          </p>
                          <p class="text-fine text-ink-2 tabular-nums">
                            {token.value}
                          </p>
                          <p class="text-fine text-ink-2">{token.use}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
          <p class="mt-6 text-fine leading-normal text-ink-2">
            텍스트 대비 4.5:1, UI 경계·포커스 3:1 이상. 상태 배지는 점과
            텍스트를 함께 써서 색만으로 구분하지 않습니다.
          </p>
          </Block>

          <Block
            label="타이포 · 12단계"
            intro="Noto Sans KR 한 서체를 씁니다. 10px 미만은 쓰지 않고, 제목 700 / 카드·버튼 제목 600 / 본문 400이 기본입니다."
          >
          <div>
            <For each={TYPE_SCALE}>
              {(type) => (
                <div class="grid gap-2 py-4 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                  <div>
                    <p class="m-0 text-fine font-semibold text-ink-1">
                      {type.token}
                    </p>
                    <p class="mt-1 text-fine text-ink-2 tabular-nums">
                      {type.size} · {type.weight} · {type.role}
                    </p>
                  </div>
                  <p class={`m-0 text-ink-1 ${type.className}`}>
                    {type.sample}
                  </p>
                </div>
              )}
            </For>
          </div>
          <div class="mt-6 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <p class="m-0 text-fine font-semibold text-ink-1">행간</p>
            <p class="m-0 text-fine leading-normal text-ink-2">
              제목·본문·버튼 모두{" "}
              <b class="font-semibold text-ink-1 tabular-nums">1.5</b>.
              본문 기준 한 값을 씁니다.
            </p>
          </div>
          </Block>

          <Block
            label="간격 · 형태 · 2px 눈금"
            intro="간격은 2·4·6·8·12·16·20·24·32·40·48·56px만 씁니다. 라운드는 컨트롤·카드 8px, 칩·배지 999px 두 종류입니다. 그림자는 떠 있는 층(메뉴·모달·FAB)에만 씁니다."
          >
          <div class="grid gap-8 lg:grid-cols-2">
            <div>
              <Label>간격</Label>
              <div class="rounded-card border border-line bg-surface p-4">
                <For each={SPACING}>
                  {(space) => (
                    <div class="flex items-center gap-3 py-1">
                      <span class="w-12 shrink-0 text-fine text-ink-2 tabular-nums">
                        {space}px
                      </span>
                      <span
                        class="h-2 shrink-0 rounded-pill bg-primary"
                        style={{ width: `${space}px` }}
                      />
                      <span class="text-fine text-ink-2">
                        --space-{space}
                      </span>
                    </div>
                  )}
                </For>
                <p class="mt-2 text-fine text-ink-2">
                  실제 크기 — 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 56
                </p>
              </div>
            </div>

            <div>
              <Label>라운드</Label>
              <div class="flex gap-4">
                <For each={RADII}>
                  {(radius) => (
                    <div class="min-w-0">
                      <div
                        class="size-16 border border-line bg-surface"
                        style={{ "border-radius": radius.radius }}
                      />
                      <p class="mt-2 text-fine font-semibold text-ink-1">
                        {radius.token}
                      </p>
                      <p class="text-fine text-ink-2 tabular-nums">
                        {radius.value} · {radius.use}
                      </p>
                    </div>
                  )}
                </For>
              </div>

              <div class="mt-6">
                <Label>레이아웃</Label>
                <div class="rounded-card border border-line bg-surface p-4">
                  <For each={LAYOUTS}>
                    {(layout) => (
                      <div class="py-2 first:pt-0">
                        <div class="flex items-center justify-between gap-4 text-fine">
                          <span class="font-semibold text-ink-1">
                            {layout.token}
                          </span>
                          <span class="text-ink-2 tabular-nums">
                            {layout.value}
                          </span>
                        </div>
                        <div class="mt-1 h-1.5 rounded-pill bg-surface-muted">
                          <div
                            class="h-full rounded-pill bg-ink-3"
                            style={{
                              width: `${(parseInt(layout.value, 10) / 1280) * 100}%`,
                            }}
                          />
                        </div>
                        <p class="mt-1 text-fine text-ink-2">
                          {layout.use}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-8">
            <Label>반응형 기준</Label>
            <div class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <For each={BREAKPOINTS}>
                {(breakpoint) => (
                  <div class="pt-2">
                    <p class="m-0 text-fine font-semibold text-ink-1">
                      {breakpoint.name}
                    </p>
                    <p class="text-fine text-ink-2 tabular-nums">
                      {breakpoint.value}
                    </p>
                    <p class="mt-1 text-fine leading-normal text-ink-2">
                      {breakpoint.use}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </div>
          </Block>
        </Section>

        <Section
          id="components"
          title="컴포넌트"
          meta="실제 구현"
          intro="컴포넌트는 모양이 아니라 계약입니다. 같은 이름은 화면이 달라도 같은 규칙을 따릅니다. 아래 예시는 모두 web/src/components/ui 의 실제 컴포넌트입니다."
        >
          <div>
            <Spec
              name="버튼"
              note="primary / secondary / danger / danger-solid · hover · focus-visible · disabled · loading"
            >
              <Label>변형</Label>
              <div class="flex flex-wrap gap-2">
                <div class="w-[148px]">
                  <Button variant="primary">대여하기</Button>
                </div>
                <div class="w-[148px]">
                  <Button variant="secondary">취소</Button>
                </div>
                <div class="w-[148px]">
                  <Button variant="danger">삭제</Button>
                </div>
                <div class="w-[148px]">
                  <Button variant="danger-solid">물품 삭제</Button>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap items-end gap-3">
                <div class="w-[148px]">
                  <Button disabled>비활성</Button>
                </div>
                <div class="w-[148px]">
                  <Button loading={busy()} onClick={() => setBusy(true)}>
                    저장
                  </Button>
                </div>
                <TextButton onClick={() => setBusy((value) => !value)}>
                  {busy() ? "로딩 멈추기" : "로딩 상태 보기"}
                </TextButton>
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                높이 40px · 14px/600 · 좌우 12px · primary는 primary-strong 채움,
                hover는 primary-deep.
              </p>
            </Spec>

            <Spec name="텍스트 버튼" note="링크 / 동작 · hover · focus-visible · danger">
              <div class="flex flex-wrap items-center gap-6">
                <TextButton href="#components" icon={<ChevronLeftIcon />}>
                  목록으로
                </TextButton>
                <TextButton onClick={() => setChip("all")}>더보기</TextButton>
                <TextButton tone="danger" onClick={() => setChip("all")}>
                  삭제
                </TextButton>
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                36px · 14px/500 · 패딩 없이 테두리·배경 없이 글자색만 바뀝니다.
              </p>
            </Spec>

            <Spec name="칩" note="12px · 좌우 8px · active · disabled">
              <Chip
                ariaLabel="상태 필터"
                value={chip()}
                options={CHIP_OPTIONS}
                onChange={setChip}
              />
              <div class="mt-3">
                <Chip
                  ariaLabel="비활성 칩"
                  value="all"
                  options={CHIP_OPTIONS.slice(0, 3)}
                  disabled
                  onChange={() => {}}
                />
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                높이 36px · 12px 글자 · 좌우 8px · 칩 사이 8px · active는 ink-1 채움 + 흰 글자 + 600.
              </p>
            </Spec>

            <Spec name="배지" note="상태 텍스트 · 12px · 좌우 8px · 읽기 전용">
              <div class="flex flex-wrap gap-2">
                <For each={BADGE_KINDS}>
                  {(kind) => <Badge kind={kind} />}
                </For>
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                12px 알약 + 6px 점 + 좌우 8px. 색만으로 구분하지 않고 텍스트가 상태를
                말합니다.
              </p>
            </Spec>

            <Spec name="태그" note="분류·대표 · 12px · 좌우 8px · 읽기 전용">
              <div class="flex flex-wrap gap-2">
                <Tag>#야외</Tag>
                <Tag>#공구</Tag>
                <Tag>대표</Tag>
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                24px 알약 · 12px · 좌우 8px. 상태 변화가 없는 라벨에 씁니다.
              </p>
            </Spec>

            <Spec name="입력" note="text / textarea / number · focus · disabled · error">
              <div class="grid gap-4 sm:grid-cols-2">
                <Input label="이름" placeholder="홍길동" />
                <Select
                  label="지회"
                  placeholder="선택"
                  options={["서울", "부산", "대구", "광주"]}
                />
                <div>
                  <Input
                    label="연락처"
                    value="010-1234"
                    invalid
                    onInput={() => {}}
                  />
                  <p class="mt-1 text-fine leading-normal text-danger">
                    연락처를 확인해 주세요.
                  </p>
                </div>
                <Input
                  label="메모"
                  type="textarea"
                  placeholder="용도, 수령처 등"
                  disabled
                />
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                높이 40px · label 14px + 8px + 컨트롤 · focus는 primary
                테두리, 오류는 danger 테두리.
              </p>
            </Spec>

            <Spec name="공지" note="info / danger · action 유무">
              <div class="grid gap-2">
                <Notice>
                  신청 후 관리자가 승인하면 대여가 시작됩니다.
                </Notice>
                <Notice
                  tone="danger"
                  alert
                  action={
                    <Button variant="secondary" class="w-auto">
                      다시 시도
                    </Button>
                  }
                >
                  대여 내역을 불러오지 못했습니다.
                </Notice>
              </div>
            </Spec>

            <Spec name="빈 상태" note="loading / empty / error · action 유무">
              <div class="grid gap-4 lg:grid-cols-2">
                <Empty
                  text="등록된 물품이 없습니다"
                  subtitle="관리자가 물품을 등록하면 여기에 표시됩니다."
                >
                  <Button variant="secondary" class="w-auto">
                    새로고침
                  </Button>
                </Empty>
                <Empty
                  state="error"
                  text="목록을 불러오지 못했습니다"
                  subtitle="연결 상태를 확인하고 다시 시도해 주세요."
                >
                  <Button variant="secondary" class="w-auto">
                    다시 시도
                  </Button>
                </Empty>
              </div>
            </Spec>

            <Spec name="모달" note="open · Esc · 포커스 트랩 · 스크롤 잠금">
              <Button
                variant="secondary"
                class="w-auto"
                onClick={() => setModalOpen(true)}
              >
                모달 열기
              </Button>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                Esc로 닫히고, 열었던 요소로 포커스가 돌아갑니다.
              </p>
              <Modal
                open={modalOpen()}
                title="반납하기"
                onClose={() => setModalOpen(false)}
                footer={
                  <>
                    <Button
                      variant="secondary"
                      class="w-auto"
                      onClick={() => setModalOpen(false)}
                    >
                      취소
                    </Button>
                    <Button
                      variant="primary"
                      class="w-auto"
                      onClick={() => setModalOpen(false)}
                    >
                      반납 완료
                    </Button>
                  </>
                }
              >
                <p class="m-0 text-body text-ink-1">
                  '캠핑 텐트 4인용'을 반납할까요?
                </p>
                <p class="mt-2 text-fine leading-normal text-ink-2">
                  반납 처리 후에는 되돌릴 수 없습니다.
                </p>
              </Modal>
            </Spec>

            <Spec name="정보 목록" note="라벨 · 값 행">
              <div class="max-w-[420px]">
                <InfoList
                  strongFirst
                  items={[
                    { label: "대여 가능", value: "2개" },
                    { label: "전체 보유", value: "4개" },
                    { label: "보관 위치", value: "지하 창고 B-2" },
                  ]}
                />
              </div>
            </Spec>

            <Spec name="행 목록" note="일반 / 강조 · 마지막 행 · 모바일 줄바꿈">
              <div class="grid max-w-[560px] gap-2">
                <ReservationRow
                  title="캠핑 텐트 4인용 · 1개"
                  badgeKind="pending"
                  actions={
                    <Button variant="secondary" class="w-auto">
                      신청 취소
                    </Button>
                  }
                >
                  <span>2026-11-05 신청</span>
                  <span>희망 반납일 2026-11-08</span>
                </ReservationRow>
                <ReservationRow
                  active
                  title="전동 드릴 · 1개"
                  badgeKind="overdue"
                  actions={
                    <>
                      <Button
                        variant="primary"
                        class="w-auto"
                        onClick={() => setModalOpen(true)}
                      >
                        반납하기
                      </Button>
                      <Button variant="secondary" class="w-auto">
                        취소
                      </Button>
                    </>
                  }
                >
                  <span>2026-11-01 대여 신청</span>
                  <span class="text-danger">
                    반납 예정 2026-11-06 · 기한이 지났습니다
                  </span>
                </ReservationRow>
              </div>
            </Spec>

            <Spec name="물품 카드" note="사진 유무 · hover · focus-visible">
              <div class="grid max-w-[460px] grid-cols-2 gap-2">
                <ItemCard item={SAMPLE_ITEMS[0]} href="/design" />
                <ItemCard item={SAMPLE_ITEMS[1]} href="/design" />
              </div>
              <p class="mt-3 text-fine leading-normal text-ink-2">
                사진 3:2 · hover는 테두리만(line-strong) · 확대 효과 없음.
              </p>
            </Spec>

            <Spec name="아이콘" note="16 / 20 / 24px · 선 2">
              <div class="flex flex-wrap gap-2">
                <For each={ICONS}>
                  {(item) => {
                    const Icon = item.Icon;
                    return (
                      <span
                        class="flex size-10 items-center justify-center rounded-card border border-line bg-surface text-ink-2"
                        title={item.name}
                      >
                        <Icon class="size-4" />
                      </span>
                    );
                  }}
                </For>
              </div>
            </Spec>

            <Spec name="스켈레톤" note="line / muted · pulse">
              <div class="max-w-[320px]">
                <div class="grid gap-2">
                  <Skeleton class="h-4 w-4/5 rounded" />
                  <Skeleton class="h-4 w-3/5 rounded" />
                  <Skeleton tone="muted" class="h-20 rounded-card" />
                </div>
              </div>
            </Spec>

            <Spec name="대여 절차" note="4단계 · 상세 화면">
              <RentalSteps class="max-w-[420px]" />
            </Spec>

            <Spec name="페이지 헤더" note="제목 · 부제 · 액션">
              <div class="rounded-card border border-line bg-surface p-4">
                <PageHeader
                  title="대여 내역"
                  subtitle="신청한 물품의 승인 상태와 지난 기록을 확인합니다."
                  action={
                    <Button variant="secondary" class="w-auto">
                      새로고침
                    </Button>
                  }
                />
              </div>
            </Spec>
          </div>
        </Section>

        <Section
          id="patterns"
          title="패턴"
          meta="화면 조립"
          intro="같은 셸과 같은 순서를 반복합니다. 새 화면도 아래 패턴 안에서 조립하고, 반복되는 규격은 components/ui 로 올립니다."
        >
          <div class="grid gap-8">
            <div class="min-w-0">
              <Label>앱 셸</Label>
              <div class="overflow-x-auto rounded-card border border-line bg-surface p-4">
                <pre class="m-0 min-w-[420px] text-fine leading-normal text-ink-2">{`헤더 56 / 64px (sticky)
├ 본문  max 1280px · padding 16px
│   ├ 1열: 페이지 제목 → 주 행동 → 내용
│   └ 2열: 주 컨텐츠 + 320px 보조 패널 (lg 이상)
└ 푸터  서비스명 · 약관 · 개인정보`}</pre>
              </div>
              <p class="mt-2 text-fine leading-normal text-ink-2">
                로그인·프로필 등록만 헤더·푸터 없는 전체 화면입니다.
              </p>
            </div>

            <div class="min-w-0">
              <Label>2열 셸</Label>
              <div class="grid gap-2 rounded-card border border-line bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div class="rounded-card border border-dashed border-line-strong bg-canvas p-4">
                  <p class="m-0 text-fine font-semibold text-ink-1">
                    주 컨텐츠
                  </p>
                  <p class="mt-1 text-fine text-ink-2">
                    minmax(0, 1fr) — 목록·폼·계정
                  </p>
                </div>
                <div class="rounded-card border border-dashed border-line-strong bg-canvas p-4">
                  <p class="m-0 text-fine font-semibold text-ink-1">
                    보조 패널
                  </p>
                  <p class="mt-1 text-fine text-ink-2">
                    320px · sticky top 96px · lg 미만 숨김
                  </p>
                </div>
              </div>
            </div>

            <div class="min-w-0">
              <Label>목록 탐색</Label>
              <div class="max-w-[560px]">
                <div class="relative">
                  <SearchIcon class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />
                  <input
                    class="h-10 w-full rounded-card border border-line bg-surface pr-10 pl-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none"
                    type="search"
                    placeholder="이름, 위치, 분류 검색"
                    aria-label="목록 탐색 예시"
                  />
                </div>
                <div class="mt-2">
                  <Chip
                    ariaLabel="상태 필터 예시"
                    value={chip()}
                    options={CHIP_OPTIONS}
                    onChange={setChip}
                  />
                </div>
                <p class="mt-2 text-fine leading-normal text-ink-2">
                  검색 → 상태 필터 → 카드 그리드. 스크롤이 끝에 가까워지면
                  다음 묶음을 자동으로 불러옵니다.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="rules"
          title="규칙 · 검증"
          meta="WCAG 2.2 AA"
          intro="모든 인터랙티브 요소는 default / hover / focus-visible / active / disabled / loading / error / empty / 모바일 390을 확인합니다."
        >
          <div class="grid gap-8 lg:grid-cols-2">
            <div>
              <Label>지킨다</Label>
              <ul class="m-0 grid list-none gap-2 p-0">
                <For each={DO_LIST}>
                  {(item) => (
                    <li class="flex gap-2 py-2 text-fine leading-normal text-ink-2">
                      <CheckIcon class="mt-0.5 size-4 shrink-0 text-primary-strong" />
                      <span>{item}</span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
            <div>
              <Label>피한다</Label>
              <ul class="m-0 grid list-none gap-2 p-0">
                <For each={DONT_LIST}>
                  {(item) => (
                    <li class="flex gap-2 py-2 text-fine leading-normal text-ink-2">
                      <CloseIcon class="mt-0.5 size-4 shrink-0 text-ink-3" />
                      <span>{item}</span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </div>

          <div class="mt-8">
            <Label>검증 명령</Label>
            <div class="overflow-x-auto rounded-card border border-line bg-surface p-4">
              <pre class="m-0 text-fine leading-normal whitespace-pre-wrap text-ink-2">{`npm run check          # 타입 검사
npm test               # 단위·통합
npm run test:web       # 390 / 1280 스모크
npm run build && npm run check:production`}</pre>
            </div>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              값과 문서가 어긋나면 코드가 맞습니다. 새 값은 tokens.css에
              먼저 추가합니다.
            </p>
          </div>
        </Section>
      </div>
    </DocPage>
  );
}
