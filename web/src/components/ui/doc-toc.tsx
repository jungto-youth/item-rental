import { For, createEffect, createSignal } from "solid-js";

export type DocSection = { id: string; label: string };

// 문서형 화면(정책·디자인 시스템)의 공통 목차.
// 데스크톱은 오른쪽 320px sticky 레일, lg 미만에서는 DocPage가 접이식 목차를 따로 보여준다.
// 제목이 상단 96px(scroll-mt-24)을 지나 화면 위쪽 30% 띠에 들어오면 현재 섹션으로 본다.
const ACTIVE_LINE = 96;

export function DocToc(props: { sections: DocSection[]; ariaLabel: string }) {
  const [active, setActive] = createSignal("");

  createEffect(
    () => props.sections,
    (sections) => {
      if (sections.length === 0) return;
      const firstId = sections[0].id;
      const lastId = sections[sections.length - 1].id;
      const order = new Map(
        sections.map((section, index) => [section.id, index]),
      );
      setActive(firstId);

      // 마지막 섹션은 문서 끝에 붙어 있어 관찰 띠까지 올라오지 못한다.
      // 바닥에 닿았을 때는 관찰 결과보다 마지막 섹션을 우선한다.
      const isAtBottom = () => {
        const doc = document.documentElement;
        if (doc.scrollHeight <= window.innerHeight + 2) return false;
        return window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      };

      const syncBottom = () => {
        if (!isAtBottom()) return false;
        setActive(lastId);
        return true;
      };

      const observer = new IntersectionObserver(
        (entries) => {
          if (syncBottom()) return;

          // 여러 제목이 동시에 띠에 들어올 수 있다 — 문서 순서상 마지막 항목을 쓴다.
          const entering = entries
            .filter((entry) => entry.isIntersecting)
            .sort(
              (a, b) =>
                (order.get(a.target.id) ?? 0) -
                (order.get(b.target.id) ?? 0),
            );
          const current = entering.at(-1);
          if (current) setActive(current.target.id);
        },
        { rootMargin: `-${ACTIVE_LINE}px 0px -70% 0px`, threshold: 0 },
      );

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) observer.observe(element);
      }

      const onScroll = () => {
        syncBottom();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      const initial = requestAnimationFrame(syncBottom);

      return () => {
        cancelAnimationFrame(initial);
        observer.disconnect();
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
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
    // 이동 중에는 제목이 띠를 지나며 갱신되지만, 즉시 이동할 때도 바로 반영한다.
    setActive(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`,
    );
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
