import { For, Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { PageHeader } from "../components/ui/page-header";
import { ProfileForm } from "../components/common/profile-form";
import { InfoList } from "../components/ui/info-list";
import { Skeleton } from "../components/ui/skeleton";
import { CheckIcon } from "../components/icons";
import { isAffiliationValid } from "../../../shared/affiliation";

export default function MyPage() {
  const [loading, setLoading] = createSignal(true);
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  const user = () => session.user();

  onSettled(() => {
    void session.ensure().then(() => setLoading(false));
  });

  const startEdit = () => {
    if (!user()) return;
    setSaved(false);
    setEditing(true);
  };

  const onSaved = () => {
    setEditing(false);
    setSaved(true);
  };

  const renderSkeleton = () => (
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-w-0">
        <Skeleton class="h-6 w-24 rounded" />
        <div
          class="mt-4 box-border rounded-card border border-line bg-surface p-6 max-sm:p-4"
          aria-hidden="true"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 items-center gap-4">
              <Skeleton tone="muted" class="size-12 shrink-0 rounded-pill" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-32 rounded" />
                <Skeleton class="mt-2 h-3.5 w-16 rounded" />
              </div>
            </div>
            <Skeleton tone="muted" class="h-10 w-16 shrink-0 rounded-card" />
          </div>
          <div class="mt-6 border-y border-line">
            <For each={Array.from({ length: 3 })}>
              {() => (
                <div class="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
                  <Skeleton class="h-3.5 w-14 rounded" />
                  <Skeleton class="h-4 w-28 rounded" />
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <aside class="flex flex-col gap-4 max-lg:hidden" aria-hidden="true">
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-4/5 rounded" />
          <Skeleton tone="muted" class="mt-4 h-10 w-28 rounded-card" />
        </div>
        <div class="rounded-card border border-line bg-surface p-4">
          <Skeleton class="h-4 w-20 rounded" />
          <Skeleton class="mt-2 h-3.5 w-full rounded" />
          <Skeleton class="mt-2 h-3.5 w-3/4 rounded" />
        </div>
      </aside>
    </div>
  );

  return (
    <div class="page-mypage block">
      <Show
        when={!loading()}
        fallback={
          <>
            <PageHeader
              title="내 정보"
              subtitle="계정 정보와 연락처를 관리합니다."
            />
            {renderSkeleton()}
          </>
        }
      >
        <Show
          when={user()}
          fallback={<Empty state="empty" text="로그인이 필요합니다" />}
        >
          {(current) => {
            const u = current;
            const initial = () =>
              (u().name || u().email).trim().charAt(0).toUpperCase();
            return (
              <>
                <PageHeader
                  title="내 정보"
                  subtitle="계정 정보와 연락처를 관리합니다."
                />

                <Show when={!u().phone || !isAffiliationValid(u().affiliation)}>
                  <div class="mt-4 mb-6 box-border flex flex-col gap-2 rounded-card border border-line bg-primary-soft px-4 py-2 text-fine leading-normal text-primary-strong sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <p class="m-0">물품을 대여하려면 연락처와 지회·모둠을 등록해야 합니다.</p>
                    <button class="cursor-pointer self-start border-0 bg-transparent p-0 text-inherit font-semibold underline underline-offset-2 hover:text-primary-deep" type="button" onClick={startEdit}>
                      정보 등록하기
                    </button>
                  </div>
                </Show>

                <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div class="min-w-0">
                    <section>
                      <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">계정 정보</h2>

                      <Show
                        when={editing()}
                        fallback={
                          <div class="card mt-4 box-border rounded-card border border-line bg-surface p-6 max-sm:p-4">
                            <div class="flex items-start justify-between gap-4">
                              <div class="flex min-w-0 items-center gap-4">
                                <span class="flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-body font-semibold text-primary-strong" aria-hidden="true">
                                  {initial()}
                                </span>
                                <div>
                                  <p class="m-0 truncate text-body font-semibold text-ink-1">{u().name || u().email}</p>
                                  <p class="mt-2 text-fine text-ink-2">정토회</p>
                                </div>
                              </div>
                              <Button variant="secondary" type="button" onClick={startEdit}>
                                수정
                              </Button>
                            </div>

                            <InfoList
                              divided={false}
                              items={[
                                {
                                  label: "이메일",
                                  value: u().email,
                                  title: u().email,
                                },
                                {
                                  label: "연락처",
                                  value: u().phone || "미등록",
                                },
                                {
                                  label: "소속",
                                  value: u().affiliation || "미등록",
                                },
                              ]}
                            />

                            <Show when={saved()}>
                              <p class="mt-2 flex items-center gap-1 text-fine text-ink-2 [&_svg]:size-4 [&_svg]:text-primary-strong" role="status">
                                <CheckIcon />
                                저장했습니다
                              </p>
                            </Show>
                          </div>
                        }
                      >
                        <ProfileForm
                          class="mt-4"
                          title="계정 정보 수정"
                          hint="이메일은 변경할 수 없습니다."
                          avatar
                          cancellable
                          email={u().email}
                          accountLabel="이메일"
                          initialName={u().name}
                          initialPhone={u().phone ?? ""}
                          initialAffiliation={u().affiliation ?? ""}
                          onSaved={onSaved}
                          onCancel={() => setEditing(false)}
                        />
                      </Show>
                    </section>
                  </div>

                  <aside class="flex flex-col gap-4 max-lg:hidden lg:sticky lg:top-24" aria-label="계정 안내">
                    <section class="rounded-card border border-line bg-surface p-4">
                      <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">대여 현황</h2>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        대여 중인 물품은 <b class="font-semibold text-ink-1">대여 내역</b>에서 확인할 수 있습니다.
                      </p>
                      <a class="mt-4 inline-flex h-10 items-center rounded-card border border-line bg-surface px-4 text-fine font-medium text-ink-1 no-underline transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1" href="/my/rentals">대여 내역 보기</a>
                    </section>

                    <section class="rounded-card border border-line bg-surface p-4">
                      <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">연락처 안내</h2>
                      <p class="mt-2 text-fine leading-normal text-ink-2">
                        연락처는 물품 대여·반납 안내에만 사용합니다. 번호가 바뀌면 내
                        정보에서 수정해 주세요.
                      </p>
                    </section>
                  </aside>
                </div>
              </>
            );
          }}
        </Show>
      </Show>
    </div>
  );
}
