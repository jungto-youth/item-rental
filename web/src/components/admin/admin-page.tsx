import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { CheckIcon } from "../icons";
import { Empty } from "../ui/empty";
import { PageHeader } from "../ui/page-header";
import { Button } from "../ui/button";

type Props = {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  message?: string;
  messageTone?: "info" | "success" | "error";
  side?: boolean;
  onRetry?: () => void;
  /** 페이지 제목 오른쪽 액션 — 내비게이션·보조 동작 */
  action?: JSX.Element;
  toolbar?: JSX.Element;
  children?: JSX.Element;
  sideContent?: JSX.Element;
};

export function AdminPage(props: Props) {
  const tone = () => props.messageTone ?? "info";
  const body = () => (
    <>
      {props.toolbar}
      <Show
        when={!props.loading}
        fallback={<Empty compact state="loading" />}
      >
        <Show
          when={!props.error}
          fallback={
            <Empty compact state="error" text={props.error}>
              <Button variant="secondary" onClick={() => props.onRetry?.()}>
                다시 시도
              </Button>
            </Empty>
          }
        >
          {props.children}
        </Show>
      </Show>
    </>
  );

  return (
    <div class="admin-page block">
      <PageHeader
        title={props.title}
        subtitle={props.subtitle}
        action={props.action}
      />
      <Show when={props.message}>
        <p
          class={`mb-6 flex items-center gap-1 text-fine ${
            tone() === "error" ? "text-danger" : "text-ink-1"
          }`}
          role={tone() === "error" ? "alert" : "status"}
        >
          <Show when={tone() === "success"}>
            <CheckIcon class="size-4 shrink-0 text-primary-strong" />
          </Show>
          <span>{props.message}</span>
        </p>
      </Show>
      <Show when={props.side} fallback={<>{body()}</>}>
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div class="min-w-0">{body()}</div>
          <aside class="flex flex-col gap-4 max-lg:hidden" aria-label="안내">
            {props.sideContent}
          </aside>
        </div>
      </Show>
    </div>
  );
}
