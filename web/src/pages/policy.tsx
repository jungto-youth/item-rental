import { For, Show } from "solid-js";

type Section = { id: string; title: string };

const PRIVACY_SECTIONS: Section[] = [
  { id: "privacy-1", title: "1. 수집하는 개인정보 항목" },
  { id: "privacy-2", title: "2. 수집 목적" },
  { id: "privacy-3", title: "3. 보관 기간 및 파기" },
  { id: "privacy-4", title: "4. 개인정보 제3자 제공" },
  { id: "privacy-5", title: "5. 개인정보 처리 위탁" },
  { id: "privacy-6", title: "6. 회원 권리" },
  { id: "privacy-7", title: "7. 문의처" },
];

const TERMS_SECTIONS: Section[] = [
  { id: "terms-1", title: "1. 목적" },
  { id: "terms-2", title: "2. 회원 가입" },
  { id: "terms-3", title: "3. 물품 대여" },
  { id: "terms-4", title: "4. 회원 의무" },
  { id: "terms-5", title: "5. 운영진 의무" },
  { id: "terms-6", title: "6. 책임 제한" },
  { id: "terms-7", title: "7. 약관 변경" },
];

export default function Policy(props: { params: Record<string, string> }) {
  const kind = () => (props.params.kind === "terms" ? "terms" : "privacy");
  const sections = () => (kind() === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS);

  const scrollToSection = (id: string, event: Event) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div class="page-policy mx-auto block max-w-doc">
      <nav class="tabs flex gap-6 border-b border-line" aria-label="정책 종류">
        <a
          href="/policy/terms"
          class={`mb-[-1px] border-b-2 pb-2 text-body no-underline hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${kind() === "terms" ? "border-ink-1 font-semibold text-ink-1" : "border-transparent text-ink-2"}`}
          aria-current={kind() === "terms" ? "page" : undefined}
        >
          이용약관
        </a>
        <a
          href="/policy/privacy"
          class={`mb-[-1px] border-b-2 pb-2 text-body no-underline hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${kind() === "privacy" ? "border-ink-1 font-semibold text-ink-1" : "border-transparent text-ink-2"}`}
          aria-current={kind() === "privacy" ? "page" : undefined}
        >
          개인정보 처리방침
        </a>
      </nav>

      <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <aside class="hidden lg:sticky lg:top-24 lg:order-2 lg:block lg:self-start">
          <p class="m-0 text-fine font-semibold text-ink-1">목차</p>
          <nav
            class="mt-2 grid gap-2"
            aria-label={
              kind() === "privacy"
                ? "개인정보 처리방침 목차"
                : "이용약관 목차"
            }
          >
            <For each={sections()}>
              {(section) => (
                <a
                  class="text-fine text-ink-2 no-underline hover:text-ink-1"
                  href={`#${section.id}`}
                  onClick={(event) => scrollToSection(section.id, event)}
                >
                  {section.title}
                </a>
              )}
            </For>
          </nav>
        </aside>

        <Show
          when={kind() === "privacy"}
          fallback={<TermsArticle />}
        >
          <PrivacyArticle />
        </Show>
      </div>
    </div>
  );
}

function ToTop() {
  return (
    <a
      class="mt-10 inline-flex text-fine text-ink-2 underline underline-offset-2 hover:text-ink-1"
      href="#top"
      onClick={(event) => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      맨 위로
    </a>
  );
}

function PrivacyArticle() {
  return (
    <article class="max-w-[680px] min-w-0 text-body leading-[1.75] lg:order-1 [&_h1]:m-0 [&_h1]:text-page-title [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-ink-1 [&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:text-heading [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:leading-[1.4] [&_h2]:text-ink-1 [&_p]:mt-2 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_li+li]:mt-1 [&_b]:font-semibold [&_b]:text-ink-1 [&_table]:w-full [&_table]:min-w-[420px] [&_table]:border-collapse [&_table]:text-fine [&_table]:leading-[1.75] [&_th]:border [&_th]:border-line [&_th]:bg-surface-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink-1 [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:text-left [&_td]:text-ink-2">
      <h1>개인정보 처리방침</h1>
      <p class="mt-2 text-fine text-ink-2">시행일: 2026-11-02</p>

      <h2 id="privacy-1">1. 수집하는 개인정보 항목</h2>
      <ul>
        <li>
          <b>구글 계정 정보</b>: 이메일 주소, 이름 (구글 OAuth 로그인 시 제공받는
          정보)
        </li>
        <li>
          <b>계정 정보</b>: 이름, 휴대폰 번호 (최초 로그인 후 직접 입력)
        </li>
        <li>
          <b>대여 이력</b>: 신청·수령·반납 기록
        </li>
      </ul>

      <h2 id="privacy-2">2. 수집 목적</h2>
      <ul>
        <li>회원 식별 및 로그인 (구글 계정)</li>
        <li>물품 대여 신청·수령·반납 과정의 연락 (휴대폰 번호)</li>
        <li>대여 이력 관리 및 분쟁 대응</li>
      </ul>

      <h2 id="privacy-3">3. 보관 기간 및 파기</h2>
      <p>
        대여 이력 보존을 위해 탈퇴(비활성화) 후에도 기록이 남습니다. 개인정보는 이용
        목적이 소멸하면 지체 없이 파기하며, 보관 기간은 다음과 같습니다.
      </p>
      <div class="mt-4 overflow-x-auto [scrollbar-width:thin]">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th>보관 기간</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>이메일·이름</td>
              <td>회원 활동 기간 + 탈퇴 후 1년</td>
            </tr>
            <tr>
              <td>휴대폰 번호</td>
              <td>회원 활동 기간 + 탈퇴 후 1년</td>
            </tr>
            <tr>
              <td>대여 이력</td>
              <td>관련 법령에 따라 보관 (분쟁 대응)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-fine text-ink-2 sm:hidden">
        표는 좌우로 넘겨서 볼 수 있습니다.
      </p>

      <h2 id="privacy-4">4. 개인정보 제3자 제공</h2>
      <p>
        회원의 개인정보를 외부에 제공하지 않습니다. 단, 법령에 근거한 요청이 있는
        경우 예외로 합니다.
      </p>

      <h2 id="privacy-5">5. 개인정보 처리 위탁</h2>
      <p>서비스 운영을 위해 아래 사업자에 개인정보 처리를 위탁하고 있습니다.</p>
      <div class="mt-4 overflow-x-auto [scrollbar-width:thin]">
        <table>
          <thead>
            <tr>
              <th>수탁자</th>
              <th>위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Google LLC (OAuth)</td>
              <td>소셜 로그인 인증</td>
            </tr>
            <tr>
              <td>Cloudflare (호스팅·데이터베이스·이미지 저장)</td>
              <td>서비스 운영 인프라, 회원·대여 정보 및 이미지 저장</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-fine text-ink-2 sm:hidden">
        표는 좌우로 넘겨서 볼 수 있습니다.
      </p>

      <h2 id="privacy-6">6. 회원 권리</h2>
      <p>
        회원은 언제든지 자신의 개인정보를 열람·수정할 수 있습니다 (내 정보에서 계정
        정보 수정 가능). 탈퇴를 원하면 관리자에게 요청해 주세요 — 비활성화 처리됩니다.
      </p>

      <h2 id="privacy-7">7. 문의처</h2>
      <p>
        개인정보 보호 관련 문의: 운영진 담당자 (서비스 관리자에게 문의해 주세요)
      </p>

      <ToTop />
    </article>
  );
}

function TermsArticle() {
  return (
    <article class="max-w-[680px] min-w-0 text-body leading-[1.75] lg:order-1 [&_h1]:m-0 [&_h1]:text-page-title [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-ink-1 [&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:text-heading [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:leading-[1.4] [&_h2]:text-ink-1 [&_p]:mt-2 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_li+li]:mt-1 [&_b]:font-semibold [&_b]:text-ink-1 [&_table]:w-full [&_table]:min-w-[420px] [&_table]:border-collapse [&_table]:text-fine [&_table]:leading-[1.75] [&_th]:border [&_th]:border-line [&_th]:bg-surface-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink-1 [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:text-left [&_td]:text-ink-2">
      <h1>서비스 이용약관</h1>
      <p class="mt-2 text-fine text-ink-2">시행일: 2026-09-10</p>

      <h2 id="terms-1">1. 목적</h2>
      <p>
        이 약관은 물품 대여 서비스(이하 “서비스”)의 이용 조건을 정해, 물품 대여
        절차와 회원·운영진의 권리·의무를 명확히 하는 데 목적이 있습니다.
      </p>

      <h2 id="terms-2">2. 회원 가입</h2>
      <ul>
        <li>정토회 계정(@jungto.org)으로 로그인하면 바로 회원으로 가입됩니다.</li>
        <li>대여 연락을 위해 휴대폰 번호 등록이 필요합니다.</li>
        <li>서비스는 지부 회원 대상 — 정토회 계정이 아니면 로그인할 수 없습니다.</li>
      </ul>

      <h2 id="terms-3">3. 물품 대여</h2>
      <ul>
        <li>물품은 신청 → 수령 → 반납 순서로 대여됩니다.</li>
        <li>수령 전이면 언제든 신청을 취소할 수 있습니다 (수령 후에는 불가).</li>
        <li>대여 기간은 물품별 최대 대여일을 넘을 수 없습니다.</li>
        <li>반납일은 물품을 돌려주는 날이며, 그 전날까지 사용할 수 있습니다.</li>
      </ul>

      <h2 id="terms-4">4. 회원 의무</h2>
      <ul>
        <li>물품을 반납일까지 관리하고 정시에 반납합니다.</li>
        <li>고의·중과실로 물품을 훼손·분실하면 복구(구매) 책임이 있습니다.</li>
        <li>반납일 경과(연체) 시 운영진이 연락할 수 있습니다.</li>
        <li>연락처가 바뀌면 내 정보에서 수정해 주세요.</li>
      </ul>

      <h2 id="terms-5">5. 운영진 의무</h2>
      <ul>
        <li>대여 신청·반납을 공정하게 처리합니다.</li>
        <li>물품 상태를 수령·반납 시점에 확인하고 기록합니다.</li>
      </ul>

      <h2 id="terms-6">6. 책임 제한</h2>
      <ul>
        <li>사용 전 물품 상태를 확인해 주세요.</li>
        <li>
          서비스는 물품 대여 기록·연락 조율 도구이며, 물품 자체의 하자로 인한 손해에
          대해 배상 책임을 지지 않습니다.
        </li>
      </ul>

      <h2 id="terms-7">7. 약관 변경</h2>
      <p>약관이 바뀌면 서비스 내 공지로 알려드립니다.</p>

      <ToTop />
    </article>
  );
}
