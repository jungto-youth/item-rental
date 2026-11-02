import {
  Show,
  createEffect,
  onCleanup,
  type JSX,
  type ParentComponent,
} from "solid-js";
import { CheckIcon, SearchIcon } from "./icons";

export const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-card bg-primary-strong px-4 text-body font-semibold text-white transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export const btnPrimarySmall =
  "inline-flex h-9 items-center justify-center rounded-card bg-primary-strong px-4 text-body font-semibold text-white transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export const btnSecondary =
  "inline-flex h-10 items-center justify-center rounded-card border border-line bg-surface px-4 text-body font-medium text-ink-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export const btnSecondarySmall =
  "inline-flex h-9 items-center justify-center rounded-card border border-line bg-surface px-4 text-body font-medium text-ink-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export const btnDanger =
  "inline-flex h-9 items-center justify-center rounded-card border border-danger bg-surface px-4 text-body font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export const inputClass =
  "field-input h-10 w-full rounded-card border border-line bg-surface px-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function FilterChip(props: {
  active: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="filter-chip"
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function StatusBadge(props: {
  children: JSX.Element;
  dotClass?: string;
}) {
  return (
    <span class="status-badge">
      <span class={`status-dot ${props.dotClass ?? "bg-ink-3"}`} />
      {props.children}
    </span>
  );
}

export function PageMessage(props: { show: boolean; children: JSX.Element }) {
  return (
    <Show when={props.show}>
      <p class="mt-3 flex items-center gap-1 text-fine text-ink-1" role="status">
        <CheckIcon class="h-4 w-4 flex-none text-primary-strong" />
        {props.children}
      </p>
    </Show>
  );
}

export const SideCard: ParentComponent<{ title: string }> = (props) => (
  <section class="rounded-card border border-line bg-surface p-4">
    <h2 class="text-body font-semibold tracking-[-0.015em] text-ink-1">
      {props.title}
    </h2>
    <div class="mt-2 text-fine leading-[1.5] text-ink-2">{props.children}</div>
  </section>
);

export function SearchBox(props: {
  value: string;
  onInput: (value: string) => void;
  label: string;
  placeholder: string;
  class?: string;
}) {
  return (
    <div class={`relative ${props.class ?? ""}`}>
      <SearchIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={props.value}
        aria-label={props.label}
        placeholder={props.placeholder}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        class="h-10 w-full rounded-card border border-line bg-surface pl-10 pr-4 text-body text-ink-1 placeholder:text-ink-2 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export function EmptyState(props: {
  icon?: JSX.Element;
  title: string;
  description?: JSX.Element;
  action?: JSX.Element;
  class?: string;
}) {
  return (
    <div
      class={`flex flex-col items-center justify-center rounded-card border border-line bg-surface px-6 py-10 text-center ${props.class ?? ""}`}
    >
      <Show when={props.icon}>
        <span
          class="flex h-12 w-12 items-center justify-center rounded-pill bg-surface-muted text-ink-3"
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </Show>
      <p class="mt-4 text-body font-semibold text-ink-1">{props.title}</p>
      <Show when={props.description}>
        <p class="mt-2 text-fine text-ink-2">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <div class="mt-4">{props.action}</div>
      </Show>
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: JSX.Element;
  footer: JSX.Element;
  labelledBy?: string;
}) {
  let panel: HTMLDivElement | undefined;
  const titleId = () => props.labelledBy ?? "modal-title";

  createEffect(() => {
    if (!props.open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => {
      if (!props.open) return;
      (
        panel?.querySelector<HTMLElement>("[data-autofocus]") ??
        panel?.querySelector<HTMLElement>(
          "button:not([disabled]), a[href], input, select, textarea",
        )
      )?.focus();
    });
    onCleanup(() => {
      document.body.style.overflow = previous;
    });
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (!props.open) return;
    if (event.key === "Escape") {
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.offsetParent !== null)
      : [];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/45 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId()}
        aria-describedby={props.description ? "modal-desc" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div
          ref={panel}
          class="w-full max-w-[400px] rounded-card bg-surface p-6 shadow-modal"
        >
          <h2
            id={titleId()}
            class="text-heading font-semibold tracking-[-0.015em] text-ink-1"
          >
            {props.title}
          </h2>
          <Show when={props.description}>
            <p id="modal-desc" class="mt-2 text-fine leading-[1.5] text-ink-2">
              {props.description}
            </p>
          </Show>
          <Show when={props.children}>
            <div class="mt-4">{props.children}</div>
          </Show>
          <div class="mt-6 flex justify-end gap-2">{props.footer}</div>
        </div>
      </div>
    </Show>
  );
}

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      description={props.description}
      footer={
        <>
          <button type="button" class={btnSecondarySmall} onClick={props.onClose}>
            {props.cancelLabel ?? "닫기"}
          </button>
          <button
            type="button"
            data-autofocus
            class={
              props.danger
                ? "inline-flex h-9 items-center justify-center rounded-card border border-danger bg-surface px-4 text-body font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                : btnPrimarySmall
            }
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    />
  );
}
