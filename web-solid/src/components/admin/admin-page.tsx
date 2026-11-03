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
    <div class="admin-page">
      <PageHeader title={props.title} subtitle={props.subtitle} />
      <Show when={props.message}>
        <p
          class={`msg ${tone()}`}
          role={tone() === "error" ? "alert" : "status"}
        >
          <Show when={tone() === "success"}>
            <CheckIcon />
          </Show>
          <span>{props.message}</span>
        </p>
      </Show>
      <Show
        when={props.side}
        fallback={<>{body()}</>}
      >
        <div class="page-split">
          <div class="page-main">{body()}</div>
          <aside class="page-side page-side-hide" aria-label="안내">
            {props.sideContent}
          </aside>
        </div>
      </Show>
    </div>
  );
}
