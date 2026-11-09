import { For, Show, createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { DocToc, type DocSection } from "./doc-toc";
import { PageHeader } from "./page-header";

export type DocTab = { href: string; label: string; active: boolean };

// 문서형 화면(정책·디자인 시스템)의 공통 셸.
// 문서 전환 탭 → 제목 → 목차 → 본문 순서로 조립한다.
// 목차는 본문의 h2[id]를 스캔해 자동으로 만든다 — 페이지마다 배열을 따로 두지 않는다.
export function DocPage(props: {
  title: string;
  subtitle?: string;
  tabs?: DocTab[];
  tabsLabel?: string;
  tocLabel: string;
  children: JSX.Element;
}) {
  const [sections, setSections] = createSignal<DocSection[]>([]);
  let content: HTMLDivElement | undefined;
  let observer: MutationObserver | undefined;

  const scan = () => {
    if (!content) return;
    const next = Array.from(
      content.querySelectorAll<HTMLElement>("h2[id][data-toc]"),
    ).map((heading) => ({
        id: heading.id,
        label: (heading.dataset.tocLabel ?? heading.textContent ?? "")
          .replace(/^\d+\.\s*/, "")
          .trim(),
      }),
    );
    setSections((previous) =>
      previous.length === next.length &&
      previous.every(
        (section, index) =>
          section.id === next[index].id && section.label === next[index].label,
      )
        ? previous
        : next,
    );
  };

  onSettled(() => {
    scan();
    if (!content) return;
    // 정책 탭 전환처럼 본문이 갈아끼워져도 목차가 따라간다.
    observer = new MutationObserver(scan);
    observer.observe(content, { childList: true, subtree: true });
    return () => observer?.disconnect();
  });

  return (
    <div class="block">
      <Show when={props.tabs?.length}>
        <nav
          class="flex gap-6 border-b border-line"
          aria-label={props.tabsLabel ?? "문서 전환"}
        >
          <For each={props.tabs}>
            {(tab) => (
              <a
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                class={`mb-[-1px] border-b-2 pb-2 text-body no-underline hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  tab.active
                    ? "border-ink-1 font-semibold text-ink-1"
                    : "border-transparent text-ink-2"
                }`}
              >
                {tab.label}
              </a>
            )}
          </For>
        </nav>
      </Show>

      <div class={props.tabs?.length ? "mt-6" : ""}>
        <PageHeader title={props.title} subtitle={props.subtitle} />
      </div>

      <Show when={sections().length > 0}>
        <details class="mt-6 mb-6 rounded-card border border-line bg-surface p-4 lg:hidden">
          <summary class="cursor-pointer text-body font-semibold text-ink-1">
            목차
          </summary>
          <nav class="mt-3 grid gap-2" aria-label={props.tocLabel}>
            <For each={sections()}>
              {(section) => (
                <a
                  href={`#${section.id}`}
                  class="text-fine text-ink-2 no-underline hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={(event) => {
                    const details = event.currentTarget.closest("details");
                    if (details) details.open = false;
                  }}
                >
                  {section.label}
                </a>
              )}
            </For>
          </nav>
        </details>
      </Show>

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <DocToc sections={sections()} ariaLabel={props.tocLabel} />

        <div ref={content} class="min-w-0 lg:order-1">
          {props.children}
        </div>
      </div>
    </div>
  );
}
