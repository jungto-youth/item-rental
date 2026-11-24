import { For, Show, createSignal, onSettled } from "solid-js";
import { api } from "../api/client";
import { session } from "../context/session";
import type { InquirySummary } from "../types";
import { navigate } from "../router";
import { fmtKstDate } from "../utils/date";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { PageHeader } from "../components/ui/page-header";
import { Skeleton } from "../components/ui/skeleton";

// 내 문의 목록 — 본인 것만 최신순. 본문은 상세에서 받는다.
export default function Inquiries() {
  const [loading, setLoading] = createSignal(true);
  const [inquiries, setInquiries] = createSignal<InquirySummary[]>([]);
  const [error, setError] = createSignal("");

  const load = async () => {
    setError("");
    try {
      const res = await api<{ inquiries: InquirySummary[] }>(
        "/api/inquiries/mine",
      );
      setInquiries(res.inquiries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "문의 내역을 불러오지 못했습니다",
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
    void (async () => {
      const user = await session.ensure();
      if (user) await load();
      else setLoading(false);
    })();
  });

  const subtitle = (inquiry: InquirySummary) =>
    [
      inquiry.item_name,
      `작성 ${fmtKstDate(inquiry.created_at)}`,
      inquiry.answered_at ? `답변 ${fmtKstDate(inquiry.answered_at)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const renderSkeleton = () => (
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        class="grid min-w-0 gap-2"
        role="status"
        aria-label="문의 내역을 불러오는 중"
      >
        <For each={Array.from({ length: 3 })}>
          {() => (
            <div class="rounded-card border border-line bg-surface p-4" aria-hidden="true">
              <Skeleton class="h-5 w-2/3 rounded" />
              <Skeleton class="mt-3 h-3.5 w-1/2 rounded" />
            </div>
          )}
        </For>
      </div>
      <aside class="flex flex-col gap-4 max-lg:hidden" aria-hidden="true">
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-4/5 rounded" />
        </div>
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-16 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
        </div>
      </aside>
    </div>
  );

  return (
    <div class="block">
      <PageHeader
        title="문의 내역"
        subtitle="문의한 내용과 답변을 확인합니다."
        action={
          <Button variant="primary" onClick={() => navigate("/inquiries/new")}>
            문의하기
          </Button>
        }
      />

      <Show when={!loading()} fallback={renderSkeleton()}>
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div class="min-w-0">
            <Show
              when={!error()}
              fallback={
                <Empty state="error" text={error()}>
                  <Button variant="secondary" onClick={retry}>
                    다시 시도
                  </Button>
                </Empty>
              }
            >
              <Show
                when={inquiries().length > 0}
                fallback={
                  <Empty
                    state="empty"
                    text="문의한 내역이 없습니다"
                    subtitle="물품·대여·계정에 대해 궁금한 점을 남겨 보세요."
                  >
                    <Button
                      variant="primary"
                      onClick={() => navigate("/inquiries/new")}
                    >
                      문의하기
                    </Button>
                  </Empty>
                }
              >
                <div class="grid gap-2">
                  <For each={inquiries()}>
                    {(inquiry) => (
                      <a
                        class="inquiry-row box-border block rounded-card border border-line bg-surface p-4 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        href={`/inquiries/${inquiry.id}`}
                      >
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge kind={inquiry.status} />
                          <p
                            class="m-0 min-w-0 flex-1 truncate text-body font-semibold text-ink-1"
                            title={inquiry.title}
                          >
                            {inquiry.title}
                          </p>
                        </div>
                        <p class="mt-2 m-0 text-fine text-ink-2">
                          {subtitle(inquiry)}
                        </p>
                      </a>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          <aside class="flex flex-col gap-4 max-lg:hidden lg:sticky lg:top-24" aria-label="문의 안내">
            <section class="rounded-card border border-line bg-surface p-4">
              <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">답변 안내</h2>
              <p class="mt-2 text-fine leading-normal text-ink-2">
                문의를 남기면 관리자가 확인 후 답변합니다. 답변이 등록되면{" "}
                <b class="font-semibold text-ink-1">답변 완료</b>로 바뀌고, 목록과
                상세에서 확인할 수 있습니다.
              </p>
            </section>
            <section class="rounded-card border border-line bg-surface p-4">
              <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">물품 문의</h2>
              <p class="mt-2 text-fine leading-normal text-ink-2">
                물품 상세에서 문의하면 그 물품이 자동으로 연결됩니다.
              </p>
              <a class="mt-4 inline-flex h-10 items-center rounded-card border border-line bg-surface px-3 text-fine font-medium text-ink-1 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1" href="/">물품 둘러보기</a>
            </section>
          </aside>
        </div>
      </Show>
    </div>
  );
}
