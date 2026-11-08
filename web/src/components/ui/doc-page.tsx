import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { DocToc, type DocSection } from "./doc-toc";
import { PageHeader } from "./page-header";

export type DocTab = { href: string; label: string; active: boolean };

// 문서형 화면(정책·디자인 시스템)의 공통 셸.
// 문서 전환 탭 → 제목 → 본문(왼쪽) + 목차(오른쪽) 순서로 조립한다.
export function DocPage(props: {
  title: string;
  subtitle?: string;
  tabs?: DocTab[];
  tabsLabel?: string;
  sections: DocSection[];
  tocLabel: string;
  children: JSX.Element;
}) {
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

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <DocToc sections={props.sections} ariaLabel={props.tocLabel} />

        <div class="min-w-0 lg:order-1">
          {props.children}
        </div>
      </div>
    </div>
  );
}
