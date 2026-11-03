import { Show, createEffect, createUniqueId } from "solid-js";
import type { JSX } from "@solidjs/web";

type Props = {
  open: boolean;
  title: string;
  maxWidth?: string;
  onClose: () => void;
  children?: JSX.Element;
  footer?: JSX.Element;
};

const stack: string[] = [];
let bodyLocks = 0;
let previousOverflow = "";

export function Modal(props: Props) {
  const titleId = createUniqueId();
  let panel: HTMLDivElement | undefined;

  const focusables = () =>
    panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.offsetParent !== null)
      : [];

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      stack.push(titleId);
      if (bodyLocks++ === 0) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      const previousFocus = document.activeElement as HTMLElement | null;
      queueMicrotask(() => {
        if (!props.open) return;
        (
          panel?.querySelector<HTMLElement>("[data-autofocus]") ??
          focusables()[0] ??
          panel
        )?.focus();
      });

      const onKeyDown = (event: KeyboardEvent) => {
        if (stack[stack.length - 1] !== titleId) return;
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      window.addEventListener("keydown", onKeyDown);

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        const at = stack.indexOf(titleId);
        if (at >= 0) stack.splice(at, 1);
        if (--bodyLocks === 0) document.body.style.overflow = previousOverflow;
        previousFocus?.focus();
      };
    },
  );

  return (
    <Show when={props.open}>
      <div
        class="x-modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div
          ref={panel}
          class="x-modal-dialog"
          style={{ "max-width": props.maxWidth ?? "500px" }}
          role="dialog"
          tabindex="-1"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div class="header">
            <h3 class="title" id={titleId}>
              {props.title}
            </h3>
          </div>
          <div class="body">{props.children}</div>
          <Show when={props.footer}>
            <div class="footer">{props.footer}</div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
