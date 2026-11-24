import { Show, createSignal, onSettled } from "solid-js";
import { api, ApiError } from "../api/client";
import type { Item } from "../types";
import { navigate } from "../router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageHeader } from "../components/ui/page-header";
import { Skeleton } from "../components/ui/skeleton";
import { TextButton } from "../components/ui/text-button";

const TITLE_MAX = 100;
const BODY_MAX = 2_000;

// 문의 작성 — ?item=42 로 들어오면 물품을 연결한다. 물품을 못 찾으면 일반 문의로 진행한다.
export default function InquiryNew() {
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemName, setItemName] = createSignal<string | null>(null);
  const [itemLoading, setItemLoading] = createSignal(false);
  const [titleError, setTitleError] = createSignal("");
  const [bodyError, setBodyError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  onSettled(() => {
    const raw = new URLSearchParams(window.location.search).get("item");
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;

    setItemLoading(true);
    void api<{ item: Item }>(`/api/items/${id}`)
      .then((res) => {
        // 폐기 물품은 새 문의에 연결하지 않는다 — 서버도 active 만 허용한다.
        if (res.item.lifecycle !== "active") return;
        setItemId(res.item.id);
        setItemName(res.item.name);
      })
      .catch(() => {
        // 물품을 못 찾아도 일반 문의로 접수할 수 있게 조용히 넘어간다.
      })
      .finally(() => setItemLoading(false));
  });

  const clearItem = () => {
    setItemId(null);
    setItemName(null);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;

    const titleText = title().trim();
    const bodyText = body().trim();
    setTitleError(
      !titleText
        ? "제목을 입력해 주세요"
        : titleText.length > TITLE_MAX
          ? `제목은 ${TITLE_MAX}자 이내로 입력해 주세요`
          : "",
    );
    setBodyError(
      !bodyText
        ? "문의 내용을 입력해 주세요"
        : bodyText.length > BODY_MAX
          ? `문의 내용은 ${BODY_MAX.toLocaleString()}자 이내로 입력해 주세요`
          : "",
    );
    if (titleError() || bodyError()) return;

    setBusy(true);
    setMessage("");
    try {
      const res = await api<{ id: number }>("/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          title: titleText,
          body: bodyText,
          ...(itemId() !== null ? { item_id: itemId() } : {}),
        }),
      });
      navigate(`/inquiries/${res.id}?created=1`, { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "bad_item") {
        clearItem();
        setMessage("물품 연결이 만료되었습니다. 일반 문의로 다시 접수해 주세요.");
      } else {
        setMessage(
          err instanceof Error
            ? err.message
            : "문의를 저장하지 못했습니다 — 잠시 후 다시 시도해 주세요",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="block">
      <PageHeader
        title="문의하기"
        subtitle="답변은 문의 내역에서 확인할 수 있습니다."
      />

      <form
        class="flex max-w-form flex-col gap-4 rounded-card border border-line bg-surface p-6 max-sm:p-4"
        onSubmit={submit}
      >
        <Show when={itemLoading()}>
          <div class="rounded-card bg-surface-muted p-4" aria-hidden="true">
            <Skeleton class="h-3.5 w-16 rounded" />
            <Skeleton class="mt-2 h-4 w-1/2 rounded" />
          </div>
        </Show>

        <Show when={itemName()}>
          {(name) => (
            <div class="flex items-center justify-between gap-4 rounded-card bg-surface-muted px-4 py-2">
              <div class="min-w-0">
                <p class="m-0 text-fine text-ink-2">연결된 물품</p>
                <p class="mt-1 m-0 truncate text-body font-semibold text-ink-1" title={name()}>
                  {name()}
                </p>
              </div>
              <TextButton onClick={clearItem}>연결 해제</TextButton>
            </div>
          )}
        </Show>

        <div class="flex flex-col gap-2">
          <Input
            label="제목 *"
            required
            maxlength={TITLE_MAX}
            value={title()}
            invalid={!!titleError()}
            onInput={(value) => {
              setTitle(value);
              if (value.trim()) setTitleError("");
            }}
          />
          <div class="flex items-start justify-between gap-2">
            <Show when={titleError()}>
              <p class="m-0 text-fine leading-normal text-danger" role="alert">
                {titleError()}
              </p>
            </Show>
            <span class="ml-auto shrink-0 text-fine text-ink-2 tabular-nums">
              {title().length}/{TITLE_MAX}
            </span>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <Input
            type="textarea"
            rows={6}
            label="문의 내용 *"
            required
            maxlength={BODY_MAX}
            value={body()}
            invalid={!!bodyError()}
            onInput={(value) => {
              setBody(value);
              if (value.trim()) setBodyError("");
            }}
          />
          <div class="flex items-start justify-between gap-2">
            <Show when={bodyError()}>
              <p class="m-0 text-fine leading-normal text-danger" role="alert">
                {bodyError()}
              </p>
            </Show>
            <span class="ml-auto shrink-0 text-fine text-ink-2 tabular-nums">
              {body().length}/{BODY_MAX.toLocaleString()}
            </span>
          </div>
        </div>

        <p class="m-0 text-fine leading-normal text-ink-2">
          개인정보나 긴급한 내용은 관리자에게 직접 연락해 주세요.
        </p>

        <Show when={message()}>
          <p class="m-0 text-fine leading-normal text-danger" role="alert">
            {message()}
          </p>
        </Show>

        <div class="mt-2 flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={busy()}
            onClick={() => navigate("/inquiries")}
          >
            취소
          </Button>
          <Button variant="primary" type="submit" loading={busy()}>
            문의 접수
          </Button>
        </div>
      </form>
    </div>
  );
}
