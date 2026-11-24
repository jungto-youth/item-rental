import { For, Show, createMemo, createSignal, onSettled } from "solid-js";
import { api, ApiError } from "../../api/client";
import type { AdminInquiry } from "../../types";
import { fmtKstDate } from "../../utils/date";
import { AdminPage } from "../../components/admin/admin-page";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Empty } from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { ChevronDownIcon, SearchIcon } from "../../components/icons";

const ANSWER_MAX = 2_000;

type Filter = "all" | "open" | "answered";
const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: "답변 대기" },
  { key: "answered", label: "답변 완료" },
];

export default function AdminInquiries() {
  const [inquiries, setInquiries] = createSignal<AdminInquiry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [messageTone, setMessageTone] = createSignal<"info" | "success" | "error">(
    "info",
  );
  const [filter, setFilter] = createSignal<Filter>("all");
  const [q, setQ] = createSignal("");
  const [openId, setOpenId] = createSignal<number | null>(null);
  const [draft, setDraft] = createSignal("");
  const [answering, setAnswering] = createSignal<number | null>(null);

  const load = async () => {
    setError("");
    try {
      const res = await api<{ inquiries: AdminInquiry[] }>(
        "/api/admin/inquiries",
      );
      setInquiries(res.inquiries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "문의 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setLoading(true);
    void load();
  };

  onSettled(() => {
    void load();
  });

  const counts = createMemo(() => ({
    all: inquiries().length,
    open: inquiries().filter((inquiry) => inquiry.status === "open").length,
    answered: inquiries().filter((inquiry) => inquiry.status === "answered")
      .length,
  }));

  const filtered = createMemo(() => {
    const query = q().trim().toLowerCase();
    return inquiries().filter((inquiry) => {
      if (filter() !== "all" && inquiry.status !== filter()) return false;
      if (!query) return true;
      return `${inquiry.title} ${inquiry.member_name ?? ""} ${inquiry.member_email} ${
        inquiry.member_phone ?? ""
      } ${inquiry.item_name ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  });

  const toggle = (inquiry: AdminInquiry) => {
    if (openId() === inquiry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(inquiry.id);
    setDraft(inquiry.answer ?? "");
    setMessage("");
  };

  const phoneHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

  const submitAnswer = async (inquiry: AdminInquiry) => {
    if (answering()) return;
    const answer = draft().trim();
    if (!answer) {
      setMessage("답변을 입력해 주세요");
      setMessageTone("error");
      return;
    }
    if (answer.length > ANSWER_MAX) {
      setMessage(`답변은 ${ANSWER_MAX.toLocaleString()}자 이내로 입력해 주세요`);
      setMessageTone("error");
      return;
    }

    setAnswering(inquiry.id);
    setMessage("");
    try {
      await api(`/api/admin/inquiries/${inquiry.id}/answer`, {
        method: "PUT",
        body: JSON.stringify({ answer }),
      });
      setMessage("답변을 등록했습니다");
      setMessageTone("success");
      await load();
      const updated = inquiries().find((row) => row.id === inquiry.id);
      setDraft(updated?.answer ?? answer);
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "답변을 저장하지 못했습니다",
      );
      setMessageTone("error");
      await load();
    } finally {
      setAnswering(null);
    }
  };

  const renderSkeleton = () => (
    <div class="grid gap-2" role="status" aria-label="문의 목록을 불러오는 중">
      <For each={Array.from({ length: 4 })}>
        {() => (
          <div class="rounded-card border border-line bg-surface p-4" aria-hidden="true">
            <Skeleton class="h-5 w-2/3 rounded" />
            <Skeleton class="mt-3 h-3.5 w-1/2 rounded" />
          </div>
        )}
      </For>
    </div>
  );

  const renderCard = (inquiry: AdminInquiry) => {
    const open = () => openId() === inquiry.id;
    const saved = () => inquiry.status === "answered";

    return (
      <article class="admin-inquiry rounded-card border border-line bg-surface">
        <button
          type="button"
          class="flex w-full cursor-pointer items-start gap-3 rounded-card border-0 bg-transparent p-4 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-expanded={open() ? "true" : "false"}
          onClick={() => toggle(inquiry)}
        >
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <Badge
                kind={saved() ? "available" : "pending"}
                label={saved() ? "답변 완료" : "답변 대기"}
              />
              <p
                class="m-0 min-w-0 flex-1 truncate text-body font-semibold text-ink-1"
                title={inquiry.title}
              >
                {inquiry.title}
              </p>
            </div>
            <p class="mt-2 m-0 truncate text-fine text-ink-2">
              {[
                inquiry.member_name || inquiry.member_email,
                inquiry.item_name,
                `작성 ${fmtKstDate(inquiry.created_at)}`,
                inquiry.answered_at
                  ? `답변 ${fmtKstDate(inquiry.answered_at)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ChevronDownIcon
            class={`mt-0.5 size-5 shrink-0 text-ink-2 transition-transform ${
              open() ? "rotate-180" : ""
            }`}
          />
        </button>

        <Show when={open()}>
          <div class="border-t border-line p-4">
            <p class="m-0 whitespace-pre-wrap text-body leading-normal text-ink-1 [overflow-wrap:anywhere]">
              {inquiry.body}
            </p>

            <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-fine text-ink-2">
              <span>{inquiry.member_name || "이름 없음"}</span>
              <span>{inquiry.member_email}</span>
              <Show when={inquiry.member_phone}>
                {(phone) => (
                  <a
                    class="text-ink-2 underline underline-offset-2 hover:text-ink-1"
                    href={phoneHref(phone())}
                  >
                    {phone()}
                  </a>
                )}
              </Show>
            </div>

            <Show when={saved()}>
              <p class="mt-4 m-0 text-fine text-ink-2">
                {[
                  inquiry.answered_by_name
                    ? `${inquiry.answered_by_name} 답변`
                    : "관리자 답변",
                  inquiry.answered_at
                    ? fmtKstDate(inquiry.answered_at)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Show>

            <div class="mt-4 flex flex-col gap-2">
              <Input
                type="textarea"
                rows={5}
                label="답변 *"
                maxlength={ANSWER_MAX}
                value={draft()}
                onInput={setDraft}
              />
              <div class="flex items-start justify-between gap-2">
                <p class="m-0 text-fine text-ink-2">
                  답변은 회원의 문의 상세에 바로 표시됩니다.
                </p>
                <span class="shrink-0 text-fine text-ink-2 tabular-nums">
                  {draft().length}/{ANSWER_MAX.toLocaleString()}
                </span>
              </div>
            </div>

            <div class="mt-4 flex justify-end">
              <Button
                variant="primary"
                loading={answering() === inquiry.id}
                disabled={answering() !== null}
                onClick={() => void submitAnswer(inquiry)}
              >
                {saved() ? "답변 수정" : "답변 등록"}
              </Button>
            </div>
          </div>
        </Show>
      </article>
    );
  };

  return (
    <AdminPage
      title="문의 관리"
      subtitle="답변 대기 문의를 확인하고 답변합니다."
      loading={loading()}
      loadingContent={renderSkeleton()}
      error={error()}
      message={message()}
      messageTone={messageTone()}
      onRetry={retry}
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <div class="flex flex-wrap gap-2" role="group" aria-label="답변 상태 필터">
            <For each={TABS}>
              {(tab) => (
                <button
                  type="button"
                  class={`h-9 cursor-pointer rounded-pill border px-3 text-fine font-medium transition-colors ${
                    filter() === tab.key
                      ? "border-primary-strong bg-primary-soft text-primary-strong"
                      : "border-line bg-surface text-ink-2 hover:bg-surface-muted hover:text-ink-1"
                  }`}
                  aria-pressed={filter() === tab.key ? "true" : "false"}
                  onClick={() => {
                    setFilter(tab.key);
                  }}
                >
                  {tab.label} {counts()[tab.key]}
                </button>
              )}
            </For>
          </div>

          <div class="relative min-w-0 flex-1">
            <Show when={!q()}>
              <SearchIcon class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />
            </Show>
            <input
              class="box-border h-10 w-full min-w-0 rounded-card border border-line bg-surface py-2 pr-10 pl-4 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
              type="search"
              aria-label="문의 검색"
              placeholder="제목, 회원, 물품 검색…"
              value={q()}
              onInput={(event) => setQ(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && q()) {
                  event.preventDefault();
                  setQ("");
                }
              }}
            />
          </div>
        </div>

        <Show
          when={filtered().length > 0}
          fallback={
            <Empty
              state="empty"
              text={q() ? "검색 결과가 없습니다" : "문의가 없습니다"}
              subtitle={
                q() ? "다른 제목이나 회원 이름으로 검색해 보세요." : undefined
              }
            />
          }
        >
          <div class="grid gap-2">
            <For each={filtered()}>{renderCard}</For>
          </div>
        </Show>
      </div>
    </AdminPage>
  );
}
