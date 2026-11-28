import { Show, createEffect, createSignal } from "solid-js";
import { api, ApiError } from "../api/client";
import type { Inquiry } from "../types";
import { navigate } from "../router";
import { fmtKstDate } from "../utils/date";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { Notice } from "../components/ui/notice";
import { PageHeader } from "../components/ui/page-header";
import { Skeleton } from "../components/ui/skeleton";
import { TextButton } from "../components/ui/text-button";
import { ChevronLeftIcon } from "../components/icons";

export default function InquiryDetail(props: { params: Record<string, string> }) {
  const [inquiry, setInquiry] = createSignal<Inquiry | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const created = () =>
    new URLSearchParams(window.location.search).get("created") === "1";

  const load = async () => {
    setError("");
    try {
      const res = await api<{ inquiry: Inquiry }>(
        `/api/inquiries/${props.params.id}`,
      );
      setInquiry(res.inquiry);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("문의를 찾을 수 없습니다");
      } else {
        setError(
          err instanceof Error ? err.message : "문의를 불러오지 못했습니다",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setLoading(true);
    void load();
  };

  createEffect(
    () => props.params.id,
    (id) => {
      if (!id) return;
      setLoading(true);
      void load();
    },
  );

  const renderSkeleton = () => (
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        class="grid min-w-0 gap-2"
        role="status"
        aria-label="문의를 불러오는 중"
      >
        <div class="rounded-card border border-line bg-surface p-6 max-sm:p-4" aria-hidden="true">
          <Skeleton class="h-6 w-2/3 rounded" />
          <Skeleton class="mt-4 h-3.5 w-1/3 rounded" />
          <Skeleton class="mt-6 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-4/5 rounded" />
        </div>
        <div class="rounded-card border border-line bg-surface p-6 max-sm:p-4" aria-hidden="true">
          <Skeleton class="h-4 w-24 rounded" />
          <Skeleton class="mt-4 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-3/5 rounded" />
        </div>
      </div>
      <aside class="flex flex-col gap-4 max-lg:hidden" aria-hidden="true">
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-3/4 rounded" />
        </div>
      </aside>
    </div>
  );

  return (
    <div class="block">
      <div class="mb-4">
        <TextButton href="/inquiries" icon={<ChevronLeftIcon />}>
          문의 내역
        </TextButton>
      </div>

      <PageHeader
        title="문의 상세"
        subtitle="문의 내용과 관리자 답변을 확인합니다."
      />

      <Show when={!loading()} fallback={renderSkeleton()}>
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div class="min-w-0">
            <Show
              when={!error()}
              fallback={
                <Empty state="error" text={error()}>
                  <Button variant="primary" onClick={retry}>
                    다시 시도
                  </Button>
                  <Button variant="secondary" onClick={() => navigate("/inquiries")}>
                    문의 내역
                  </Button>
                </Empty>
              }
            >
              <Show when={inquiry()}>
                {(current) => {
                  const it = current;
                  return (
                    <>
                      <Show when={created()}>
                        <div class="mb-6">
                          <Notice>문의가 접수되었습니다.</Notice>
                        </div>
                      </Show>

                      <article class="inquiry-detail rounded-card border border-line bg-surface p-6 max-sm:p-4">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge kind={it().status} />
                          <h2 class="m-0 min-w-0 flex-1 text-heading font-semibold tracking-tight text-ink-1 [overflow-wrap:anywhere]">
                            {it().title}
                          </h2>
                        </div>

                        <p class="mt-2 m-0 text-fine text-ink-2">
                          작성 {fmtKstDate(it().created_at)}
                          <Show when={it().item_name && it().item_id}>
                            {" · "}
                            <a
                              class="text-ink-2 underline underline-offset-2 hover:text-ink-1"
                              href={`/items/${it().item_id}`}
                            >
                              {it().item_name}
                            </a>
                          </Show>
                        </p>

                        <p class="mt-6 m-0 whitespace-pre-wrap text-body leading-normal text-ink-1 [overflow-wrap:anywhere]">
                          {it().body}
                        </p>
                      </article>

                      <section class="mt-6 rounded-card border border-line bg-surface p-6 max-sm:p-4">
                        <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">답변</h2>
                        <Show
                          when={it().status === "answered" && it().answer}
                          fallback={
                            <p class="mt-2 m-0 text-body leading-normal text-ink-2">
                              아직 답변 전입니다. 답변이 등록되면 이 화면에서 확인할 수
                              있습니다.
                            </p>
                          }
                        >
                          <p class="mt-6 m-0 whitespace-pre-wrap text-body leading-normal text-ink-1 [overflow-wrap:anywhere]">
                            {it().answer}
                          </p>
                          <p class="mt-4 m-0 text-fine text-ink-2">
                            관리자 답변
                            <Show when={it().answered_at}>
                              {` · ${fmtKstDate(it().answered_at!)}`}
                            </Show>
                          </p>
                        </Show>
                      </section>
                    </>
                  );
                }}
              </Show>
            </Show>
          </div>

          <aside class="flex flex-col gap-4 max-lg:hidden lg:sticky lg:top-24" aria-label="답변 안내">
            <section class="rounded-card border border-line bg-surface p-4">
              <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">답변 상태</h2>
              <p class="mt-2 text-fine leading-normal text-ink-2">
                <b class="font-semibold text-ink-1">답변 대기</b>는 관리자가 아직
                답변하지 않은 상태입니다. 답변이 등록되면{" "}
                <b class="font-semibold text-ink-1">답변 완료</b>로 바뀌고, 문의
                내용 아래에 답변이 표시됩니다.
              </p>
            </section>
          </aside>
        </div>
      </Show>
    </div>
  );
}
