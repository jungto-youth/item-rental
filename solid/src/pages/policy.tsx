import { A, useLocation } from "@solidjs/router";
import { For, Show, createMemo, type JSX } from "solid-js";

type PolicyKind = "terms" | "privacy";

const TOC: Record<PolicyKind, [string, string][]> = {
  terms: [
    ["terms-1", "1. 목적"],
    ["terms-2", "2. 회원 가입"],
    ["terms-3", "3. 물품 대여"],
    ["terms-4", "4. 회원 의무"],
    ["terms-5", "5. 운영진 의무"],
    ["terms-6", "6. 책임 제한"],
    ["terms-7", "7. 약관 변경"],
  ],
  privacy: [
    ["privacy-1", "1. 수집하는 개인정보 항목"],
    ["privacy-2", "2. 수집 목적"],
    ["privacy-3", "3. 보관 기간 및 파기"],
    ["privacy-4", "4. 개인정보 제3자 제공"],
    ["privacy-5", "5. 개인정보 처리 위탁"],
    ["privacy-6", "6. 회원 권리"],
    ["privacy-7", "7. 문의처"],
  ],
};

function Section(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <>
      <h2
        id={props.id}
        class="mt-8 scroll-mt-24 text-heading font-semibold tracking-[-0.015em] text-ink-1"
      >
        {props.title}
      </h2>
      {props.children}
    </>
  );
}

function List(props: { children: JSX.Element }) {
  return (
    <ul class="mt-2 list-disc space-y-1 pl-5 text-body leading-[1.75] text-ink-2">
      {props.children}
    </ul>
  );
}

function Paragraph(props: { children: JSX.Element }) {
  return (
    <p class="mt-2 text-body leading-[1.75] text-ink-2">{props.children}</p>
  );
}

const tableHead =
  "border border-line bg-surface-muted px-2 py-2 text-left font-semibold text-ink-1";
const tableCell = "border border-line px-2 py-2 text-ink-2";

function TermsArticle() {
  return (
    <article>
      <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
        서비스 이용약관
      </h1>
      <p class="mt-2 text-fine text-ink-2">시행일: 2026-09-10</p>

      <Section id="terms-1" title="1. 목적">
        <Paragraph>
          이 약관은 물품 대여 서비스(이하 “서비스”)의 이용 조건을 정해, 물품
          대여 절차와 회원·운영진의 권리·의무를 명확히 하는 데 목적이 있어요.
        </Paragraph>
      </Section>

      <Section id="terms-2" title="2. 회원 가입">
        <List>
          <li>정토회 계정(@jungto.org)으로 로그인하면 바로 회원으로 가입돼요.</li>
          <li>대여 연락을 위해 휴대폰 번호 등록이 필요해요.</li>
          <li>
            서비스는 지부 회원 대상 — 정토회 계정이 아니면 로그인할 수 없어요.
          </li>
        </List>
      </Section>

      <Section id="terms-3" title="3. 물품 대여">
        <List>
          <li>물품은 신청 → 수령 → 반납 순서로 대여돼요.</li>
          <li>수령 전이면 언제든 신청을 취소할 수 있어요 (수령 후에는 불가).</li>
          <li>대여 기간은 물품별 최대 대여일을 넘을 수 없어요.</li>
          <li>반납일은 물품을 돌려주는 날이며, 그 전날까지 사용할 수 있어요.</li>
        </List>
      </Section>

      <Section id="terms-4" title="4. 회원 의무">
        <List>
          <li>물품을 반납일까지 관리하고 정시에 반납해요.</li>
          <li>고의·중과실로 물품을 훼손·분실하면 복구(구매) 책임이 있어요.</li>
          <li>반납일 경과(연체) 시 운영진이 연락할 수 있어요.</li>
          <li>연락처가 바뀌면 내 정보에서 수정해 주세요.</li>
        </List>
      </Section>

      <Section id="terms-5" title="5. 운영진 의무">
        <List>
          <li>대여 신청·반납을 공정하게 처리해요.</li>
          <li>물품 상태를 수령·반납 시점에 확인하고 기록해요.</li>
        </List>
      </Section>

      <Section id="terms-6" title="6. 책임 제한">
        <List>
          <li>사용 전 물품 상태를 확인해 주세요.</li>
          <li>
            서비스는 물품 대여 기록·연락 조율 도구이며, 물품 자체의 하자로 인한
            손해에 대해 배상 책임을 지지 않아요.
          </li>
        </List>
      </Section>

      <Section id="terms-7" title="7. 약관 변경">
        <Paragraph>약관이 바뀌면 서비스 내 공지로 알려드려요.</Paragraph>
      </Section>

      <A
        href="/policy?kind=terms#top"
        class="mt-10 inline-flex text-fine text-ink-2 underline underline-offset-2 transition-colors hover:text-ink-1"
      >
        맨 위로
      </A>
    </article>
  );
}

function PrivacyArticle() {
  return (
    <article>
      <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
        개인정보 처리방침
      </h1>
      <p class="mt-2 text-fine text-ink-2">시행일: 2026-11-02</p>

      <Section id="privacy-1" title="1. 수집하는 개인정보 항목">
        <List>
          <li>
            <b class="font-semibold text-ink-1">구글 계정 정보</b>: 이메일
            주소, 이름 (구글 OAuth 로그인 시 제공받는 정보)
          </li>
          <li>
            <b class="font-semibold text-ink-1">계정 정보</b>: 이름, 휴대폰
            번호 (최초 로그인 후 직접 입력)
          </li>
          <li>
            <b class="font-semibold text-ink-1">대여 이력</b>: 신청·수령·반납
            기록
          </li>
        </List>
      </Section>

      <Section id="privacy-2" title="2. 수집 목적">
        <List>
          <li>회원 식별 및 로그인 (구글 계정)</li>
          <li>물품 대여 신청·수령·반납 과정의 연락 (휴대폰 번호)</li>
          <li>대여 이력 관리 및 분쟁 대응</li>
        </List>
      </Section>

      <Section id="privacy-3" title="3. 보관 기간 및 파기">
        <Paragraph>
          대여 이력 보존을 위해 탈퇴(비활성화) 후에도 기록이 남아요. 개인정보는
          이용 목적이 소멸하면 지체 없이 파기하며, 보관 기간은 다음과 같아요.
        </Paragraph>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[420px] border-collapse text-fine">
            <thead>
              <tr>
                <th class={tableHead}>항목</th>
                <th class={tableHead}>보관 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class={tableCell}>이메일·이름</td>
                <td class={tableCell}>회원 활동 기간 + 탈퇴 후 1년</td>
              </tr>
              <tr>
                <td class={tableCell}>휴대폰 번호</td>
                <td class={tableCell}>회원 활동 기간 + 탈퇴 후 1년</td>
              </tr>
              <tr>
                <td class={tableCell}>대여 이력</td>
                <td class={tableCell}>관련 법령에 따라 보관 (분쟁 대응)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="privacy-4" title="4. 개인정보 제3자 제공">
        <Paragraph>
          회원의 개인정보를 외부에 제공하지 않아요. 단, 법령에 근거한 요청이 있는
          경우 예외로 해요.
        </Paragraph>
      </Section>

      <Section id="privacy-5" title="5. 개인정보 처리 위탁">
        <Paragraph>
          서비스 운영을 위해 아래 사업자에 개인정보 처리를 위탁하고 있어요.
        </Paragraph>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[420px] border-collapse text-fine">
            <thead>
              <tr>
                <th class={tableHead}>수탁자</th>
                <th class={tableHead}>위탁 업무</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class={tableCell}>Google LLC (OAuth)</td>
                <td class={tableCell}>소셜 로그인 인증</td>
              </tr>
              <tr>
                <td class={tableCell}>
                  Cloudflare (호스팅·데이터베이스·이미지 저장)
                </td>
                <td class={tableCell}>
                  서비스 운영 인프라, 회원·대여 정보 및 이미지 저장
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="privacy-6" title="6. 회원 권리">
        <Paragraph>
          회원은 언제든지 자신의 개인정보를 열람·수정할 수 있어요 (내 정보에서
          계정 정보 수정 가능). 탈퇴를 원하면 관리자에게 요청해 주세요 —
          비활성화 처리돼요.
        </Paragraph>
      </Section>

      <Section id="privacy-7" title="7. 문의처">
        <Paragraph>
          개인정보 보호 관련 문의: 운영진 담당자 (서비스 관리자에게 문의해 주세요)
        </Paragraph>
      </Section>

      <A
        href="/policy?kind=privacy#top"
        class="mt-10 inline-flex text-fine text-ink-2 underline underline-offset-2 transition-colors hover:text-ink-1"
      >
        맨 위로
      </A>
    </article>
  );
}

export default function Policy() {
  const location = useLocation();
  const kind = createMemo<PolicyKind>(() =>
    new URLSearchParams(location.search).get("kind") === "terms"
      ? "terms"
      : "privacy",
  );

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 pb-2 text-body transition-colors hover:text-ink-1 ${
      active
        ? "border-ink-1 font-semibold text-ink-1"
        : "border-transparent text-ink-2"
    }`;

  return (
    <main
      id="top"
      class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8"
    >
      <nav class="flex gap-6 border-b border-line" aria-label="정책 종류">
        <A
          href="/policy?kind=terms"
          class={tabClass(kind() === "terms")}
          aria-current={kind() === "terms" ? "page" : undefined}
        >
          이용약관
        </A>
        <A
          href="/policy?kind=privacy"
          class={tabClass(kind() === "privacy")}
          aria-current={kind() === "privacy" ? "page" : undefined}
        >
          개인정보 처리방침
        </A>
      </nav>

      <div class="policy-layout mt-8">
        <div class="policy-body min-w-0">
          <Show when={kind() === "terms"} fallback={<PrivacyArticle />}>
            <TermsArticle />
          </Show>
        </div>

        <aside class="policy-toc hidden lg:block" aria-label="목차">
          <p class="text-fine font-semibold text-ink-1">목차</p>
          <nav class="mt-2 space-y-2" aria-label="정책 목차">
            <For each={TOC[kind()]}>
              {([id, label]) => (
                <A
                  href={`/policy?kind=${kind()}#${id}`}
                  class="block text-fine text-ink-2 transition-colors hover:text-ink-1"
                >
                  {label}
                </A>
              )}
            </For>
          </nav>
        </aside>
      </div>
    </main>
  );
}
