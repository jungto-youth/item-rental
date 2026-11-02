import { A } from "@solidjs/router";
import { For, Show, type JSX } from "solid-js";
import {
  AlertCircleIcon,
  CheckIcon,
  PackageIcon,
  SearchIcon,
} from "../components/icons";
import { ItemCardSkeleton } from "../components/item-card";
import {
  btnPrimary,
  btnSecondary,
  btnSecondarySmall,
} from "../components/ui";
import { useAppStore } from "../store";

function StateCard(props: {
  title: string;
  tag: string;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <article
      class={`overflow-hidden rounded-card border border-line bg-surface ${props.class ?? ""}`}
    >
      <div class="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
        <h3 class="text-fine font-semibold text-ink-1">{props.title}</h3>
        <span class="text-fine text-ink-2">{props.tag}</span>
      </div>
      <div class="bg-canvas p-4">{props.children}</div>
    </article>
  );
}

function EmptyBox(props: {
  icon: JSX.Element;
  iconClass: string;
  title: string;
  description?: JSX.Element;
  action?: JSX.Element;
}) {
  return (
    <div class="flex flex-col items-center justify-center rounded-card border border-line bg-surface px-6 py-10 text-center">
      <span
        class={`flex h-12 w-12 items-center justify-center rounded-pill ${props.iconClass}`}
        aria-hidden="true"
      >
        {props.icon}
      </span>
      <p class="mt-4 text-body font-semibold text-ink-1">{props.title}</p>
      <Show when={props.description}>
        <p class="mt-2 text-fine text-ink-2">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          {props.action}
        </div>
      </Show>
    </div>
  );
}

export default function States() {
  const store = useAppStore();

  return (
    <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-8 sm:px-6">
      <div class="max-w-[720px]">
        <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
          상태 화면
        </h1>
        <p class="mt-2 text-body text-ink-2">
          목록과 상세가 비었을 때, 불러오지 못했을 때, 대여할 수 없을 때의 화면을
          같은 컴포넌트로 정리했습니다.
        </p>
      </div>

      <section class="mt-10">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
              물품 현황
            </h2>
            <p class="mt-2 text-fine text-ink-2">
              목록 · 검색 · 불러오기 상태
            </p>
          </div>
          <span class="text-fine text-ink-2">5개 상태</span>
        </div>

        <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <StateCard title="로딩" tag="스켈레톤" class="lg:col-span-2">
            <div role="status">
              <span class="sr-only">물품 목록을 불러오는 중</span>
              <div class="flex gap-2" aria-hidden="true">
                <div class="h-10 flex-1 rounded-card border border-line bg-surface" />
                <div class="hidden h-10 w-24 rounded-card border border-line bg-surface sm:block" />
              </div>
              <div
                class="mt-4 grid grid-cols-3 gap-2 md:grid-cols-5"
                aria-hidden="true"
              >
                <For each={[0, 1, 2, 3, 4]}>
                  {(index) => (
                    <ItemCardSkeleton
                      class={index > 2 ? "hidden md:block" : ""}
                    />
                  )}
                </For>
              </div>
            </div>
          </StateCard>

          <StateCard title="빈 목록" tag="빈 상태">
            <EmptyBox
              icon={<PackageIcon class="h-6 w-6" />}
              iconClass="bg-surface-muted text-ink-3"
              title="등록된 물품이 없어요"
              description={
                store.isAdmin()
                  ? "첫 물품을 등록하면 회원이 바로 대여할 수 있어요."
                  : "관리자가 물품을 등록하면 여기에 표시돼요."
              }
              action={
                <Show when={store.isAdmin()}>
                  <A href="/items/new" class={btnPrimary}>
                    물품 등록
                  </A>
                </Show>
              }
            />
          </StateCard>

          <StateCard title="검색 결과 없음" tag="결과 없음">
            <div class="relative">
              <SearchIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value="텐트"
                aria-label="물품 검색"
                class="h-10 w-full rounded-card border border-line bg-surface pl-10 pr-4 text-body text-ink-1 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div class="mt-4">
              <EmptyBox
                icon={<SearchIcon class="h-6 w-6" />}
                iconClass="bg-surface-muted text-ink-3"
                title="'텐트'로 찾은 물품이 없어요"
                description="다른 이름이나 위치로 검색해 보세요."
                action={<button type="button" class={btnSecondary}>검색어 지우기</button>}
              />
            </div>
          </StateCard>

          <StateCard title="오류" tag="오류">
            <EmptyBox
              icon={<AlertCircleIcon class="h-6 w-6" />}
              iconClass="bg-danger-soft text-danger"
              title="물품 목록을 불러오지 못했어요"
              description="연결 상태를 확인하고 다시 시도해 주세요."
              action={<button type="button" class={btnSecondary}>다시 시도</button>}
            />
          </StateCard>

          <StateCard title="더보기 실패" tag="일부 실패">
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-3">
              <p class="flex items-center gap-2 text-fine text-ink-1">
                <AlertCircleIcon class="h-4 w-4 flex-none text-warning" />
                더 불러오지 못했어요 — 다시 시도해 주세요
              </p>
              <button type="button" class={btnSecondarySmall}>
                다시 시도
              </button>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
              <For each={[0, 1, 2]}>
                {() => <ItemCardSkeleton />}
              </For>
            </div>
          </StateCard>
        </div>
      </section>

      <section class="mt-10">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-heading font-semibold tracking-[-0.015em] text-ink-1">
              물품 상세
            </h2>
            <p class="mt-2 text-fine text-ink-2">
              불러오기 · 대여 불가 · 대여 완료
            </p>
          </div>
          <span class="text-fine text-ink-2">4개 상태</span>
        </div>

        <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <StateCard title="로딩" tag="스켈레톤" class="lg:col-span-2">
            <div role="status">
              <span class="sr-only">물품 정보를 불러오는 중</span>
              <div
                class="h-9 w-24 animate-pulse rounded-card bg-line motion-reduce:animate-none"
                aria-hidden="true"
              />
              <div
                class="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]"
                aria-hidden="true"
              >
                <div>
                  <div class="aspect-[4/3] animate-pulse rounded-card border border-line bg-surface-muted motion-reduce:animate-none" />
                  <div class="mt-2 grid grid-cols-3 gap-2">
                    <For each={[0, 1, 2]}>
                      {() => (
                        <div class="aspect-[4/3] animate-pulse rounded-card bg-surface-muted motion-reduce:animate-none" />
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <div class="h-7 w-2/3 animate-pulse rounded bg-line motion-reduce:animate-none" />
                  <div class="mt-4 space-y-2">
                    <div class="h-4 w-full animate-pulse rounded bg-line motion-reduce:animate-none" />
                    <div class="h-4 w-5/6 animate-pulse rounded bg-line motion-reduce:animate-none" />
                    <div class="h-4 w-2/3 animate-pulse rounded bg-line motion-reduce:animate-none" />
                  </div>
                  <div class="mt-4 flex gap-2">
                    <For each={[0, 1, 2]}>
                      {() => (
                        <div class="h-7 w-16 animate-pulse rounded-pill bg-line motion-reduce:animate-none" />
                      )}
                    </For>
                  </div>
                  <div class="mt-6 space-y-2 border-y border-line py-2">
                    <div class="h-4 w-full animate-pulse rounded bg-line motion-reduce:animate-none" />
                    <div class="h-4 w-full animate-pulse rounded bg-line motion-reduce:animate-none" />
                    <div class="h-4 w-3/4 animate-pulse rounded bg-line motion-reduce:animate-none" />
                  </div>
                  <div class="mt-6 rounded-card border border-line bg-surface p-4">
                    <div class="h-5 w-24 animate-pulse rounded bg-line motion-reduce:animate-none" />
                    <div class="mt-4 h-10 w-full animate-pulse rounded-card bg-line motion-reduce:animate-none" />
                    <div class="mt-4 h-10 w-full animate-pulse rounded-card bg-line motion-reduce:animate-none" />
                  </div>
                </div>
              </div>
            </div>
          </StateCard>

          <StateCard title="오류" tag="오류">
            <EmptyBox
              icon={<AlertCircleIcon class="h-6 w-6" />}
              iconClass="bg-danger-soft text-danger"
              title="물품 정보를 불러오지 못했어요"
              description="삭제되었거나 연결이 불안정해요."
              action={
                <>
                  <button type="button" class={btnPrimary}>
                    다시 시도
                  </button>
                  <A href="/" class={btnSecondary}>
                    목록으로
                  </A>
                </>
              }
            />
          </StateCard>

          <StateCard title="대여 완료" tag="완료">
            <EmptyBox
              icon={<CheckIcon class="h-6 w-6" />}
              iconClass="bg-primary-soft text-primary-strong"
              title="대여했어요"
              description={
                <>
                  '4인용 텐트' 1개를 대여 중이에요.
                  <br />
                  반납은 대여 기록에서 할 수 있어요.
                </>
              }
              action={
                <>
                  <A href="/my-rentals" class={btnPrimary}>
                    대여 기록
                  </A>
                  <A href="/" class={btnSecondary}>
                    계속 둘러보기
                  </A>
                </>
              }
            />
          </StateCard>

          <StateCard title="대여 불가" tag="안내" class="lg:col-span-2">
            <div class="grid gap-2 sm:grid-cols-2">
              <div class="rounded-card border border-line bg-surface p-4">
                <p class="text-fine font-semibold text-ink-1">재고 없음</p>
                <p class="mt-2 rounded-card bg-danger-soft px-4 py-2 text-fine text-danger">
                  지금은 재고가 없어요 — 반납 후 다시 시도해 주세요.
                </p>
              </div>
              <div class="rounded-card border border-line bg-surface p-4">
                <p class="text-fine font-semibold text-ink-1">로그인 필요</p>
                <div class="mt-2 flex items-center justify-between gap-2 rounded-card bg-surface-muted px-4 py-2">
                  <p class="text-fine text-ink-1">
                    대여하려면 로그인이 필요해요.
                  </p>
                  <A href="/login" class={`${btnPrimary} h-8 px-4 text-fine`}>
                    로그인
                  </A>
                </div>
              </div>
              <div class="rounded-card border border-line bg-surface p-4">
                <p class="text-fine font-semibold text-ink-1">소모품</p>
                <p class="mt-2 rounded-card bg-surface-muted px-4 py-2 text-fine text-ink-1">
                  소모품이에요 — 별도 대여 신청 없이 관리자에게 문의해 주세요.
                </p>
              </div>
              <div class="rounded-card border border-line bg-surface p-4">
                <p class="text-fine font-semibold text-ink-1">대여 종료</p>
                <p class="mt-2 rounded-card bg-danger-soft px-4 py-2 text-fine text-danger">
                  더 이상 대여하지 않는 물품이에요.
                </p>
              </div>
            </div>
          </StateCard>
        </div>
      </section>
    </main>
  );
}
