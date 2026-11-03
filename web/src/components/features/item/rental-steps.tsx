// 대여 절차 안내 — 상세 화면의 대여 폼 바로 아래에 둔다 (BACKLOG B-04).
// B-10 승인제가 들어오면 3단계 문구를 "신청 후 승인"으로 바꾼다.
const STEPS = [
  { title: "물품 선택", detail: "빌릴 물품과 대여 가능 수량을 확인해요." },
  { title: "신청서 작성", detail: "수량·메모·반납 예정일을 적고 대여를 신청해요." },
  { title: "승인", detail: "관리자가 재고를 확인하고 승인하면 대여가 시작돼요." },
  { title: "반납", detail: "대여 내역에서 반납하면 끝나요." },
];

export function RentalSteps(props: { class?: string }) {
  return (
    <section
      class={`box-border rounded-card border border-line bg-surface p-4 ${props.class ?? ""}`}
      aria-labelledby="rental-steps-title"
    >
      <h2
        id="rental-steps-title"
        class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1"
      >
        대여 절차
      </h2>
      <ol class="m-0 mt-4 grid list-none gap-2 p-0">
        {STEPS.map((step, index) => (
          <li class="flex items-start gap-2 text-fine leading-normal text-ink-2">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-fine font-semibold text-primary-strong"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span>
              <b class="font-semibold text-ink-1">{step.title}</b> — {step.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
