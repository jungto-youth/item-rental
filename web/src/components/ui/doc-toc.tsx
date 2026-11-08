import { For, createEffect, createSignal } from "solid-js";

export type DocSection = { id: string; label: string };

// 제목이 화면 위에서 이만큼 올라오면 그 섹션이 현재 섹션이다.
// 본문 h2 의 scroll-mt-24(96px)와 같은 값이라, 목차로 이동한 위치와 판정이 맞는다.
const ACTIVE_LINE = 96;

// 문서형 화면(정책·디자인 시스템)의 공통 목차.
// 데스크톱은 오른쪽 320px sticky 레일, lg 미만에서는 숨긴다.
// 스크롤 위치를 관찰해 현재 읽는 섹션을 굵게 표시한다.
export function DocToc(props: { sections: DocSection[]; ariaLabel: string }) {
  const [active, setActive] = createSignal("");

  // 목차를 눌러 이동한 섹션. 사용자가 직접 스크롤하기 전까지는 이 섹션을 유지한다.
  let pinned = "";

  createEffect(
    () => props.sections,
    (sections) => {
      const firstId = sections[0]?.id ?? "";
      const lastId = sections[sections.length - 1]?.id ?? "";
      setActive(firstId);
      pinned = "";

      // 제목이 상단 기준선(ACTIVE_LINE)을 지난 마지막 섹션이 현재 섹션이다.
      // 아직 아무 제목도 지나지 않았으면 첫 섹션을 유지한다.
      // 마지막 섹션은 문서 끝에 붙어 있어 기준선까지 올라오지 못하므로,
      // 바닥에 닿았을 때는 마지막 섹션을 활성화한다.
      const isAtBottom = () => {
        const doc = document.documentElement;
        // 스크롤할 여지가 없는 문서는 '바닥'으로 보지 않는다.
        if (doc.scrollHeight <= window.innerHeight + 2) return false;
        return window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      };

      const compute = () => {
        if (pinned) return;
        if (lastId && isAtBottom()) {
          setActive(lastId);
          return;
        }
        let current = firstId;
        for (const section of sections) {
          const element = document.getElementById(section.id);
          if (element && element.getBoundingClientRect().top <= ACTIVE_LINE) {
            current = section.id;
          }
        }
        setActive(current);
      };

      // 스크롤 이벤트마다 측정하지 않도록 프레임당 한 번만 계산한다.
      let frame = 0;
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          compute();
        });
      };

      // 사용자가 직접 스크롤하면 클릭으로 고정한 섹션을 놓아준다.
      const release = () => {
        pinned = "";
        schedule();
      };

      // 섹션 목록이 바뀐 직후(약관↔개인정보 전환)에는 DOM 반영을 한 프레임 기다린다.
      const initial = requestAnimationFrame(compute);

      window.addEventListener("wheel", release, { passive: true });
      window.addEventListener("touchstart", release, { passive: true });
      window.addEventListener("keydown", release);
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);

      return () => {
        cancelAnimationFrame(initial);
        if (frame) cancelAnimationFrame(frame);
        window.removeEventListener("wheel", release);
        window.removeEventListener("touchstart", release);
        window.removeEventListener("keydown", release);
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
      };
    },
  );

  const go = (event: MouseEvent, id: string) => {
    event.preventDefault();
    const element = document.getElementById(id);
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`,
    );
    pinned = id;
    setActive(id);
  };

  return (
    <aside class="hidden lg:order-2 lg:sticky lg:top-24 lg:block lg:self-start">
      <p class="m-0 text-fine font-semibold text-ink-1">목차</p>
      <nav class="mt-2 grid gap-2" aria-label={props.ariaLabel}>
        <For each={props.sections}>
          {(section) => (
            <a
              class={`text-fine no-underline transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active() === section.id
                  ? "font-semibold text-ink-1"
                  : "text-ink-2"
              }`}
              href={`#${section.id}`}
              aria-current={active() === section.id ? "location" : undefined}
              onClick={(event) => go(event, section.id)}
            >
              {section.label}
            </a>
          )}
        </For>
      </nav>
    </aside>
  );
}
