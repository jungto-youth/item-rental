import { Show, createSignal, onSettled } from "solid-js";
import { session } from "../context/session";
import { Button } from "../components/ui/button";
import { Empty } from "../components/ui/empty";
import { PageHeader } from "../components/ui/page-header";
import { ProfileForm } from "../components/common/profile-form";
import { CheckIcon } from "../components/icons";

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

  return (
    <div class="page-mypage">
      <Show when={!loading()} fallback={<Empty state="loading" />}>
        <Show
          when={user()}
          fallback={<Empty state="empty" text="로그인이 필요해요" />}
        >
          {(current) => {
            const u = current;
            const initial = () =>
              (u().name || u().email).trim().charAt(0).toUpperCase();
            return (
              <>
                <PageHeader
                  title="내 정보"
                  subtitle="계정 정보와 연락처를 관리해요."
                />

                <Show when={!u().phone}>
                  <div class="banner">
                    <p>물품을 대여하려면 연락처를 등록해야 해요.</p>
                    <button type="button" onClick={startEdit}>
                      연락처 등록하기
                    </button>
                  </div>
                </Show>

                <div class="split">
                  <div class="main content">
                    <section>
                      <h2>계정 정보</h2>

                      <Show
                        when={editing()}
                        fallback={
                          <div class="card">
                            <div class="view-head">
                              <div class="who">
                                <span class="avatar" aria-hidden="true">
                                  {initial()}
                                </span>
                                <div>
                                  <p class="name">{u().name || u().email}</p>
                                  <p class="org">정토회</p>
                                </div>
                              </div>
                              <Button variant="secondary" type="button" onClick={startEdit}>
                                수정
                              </Button>
                            </div>

                            <dl>
                              <div class="row">
                                <dt>이메일</dt>
                                <dd title={u().email}>{u().email}</dd>
                              </div>
                              <div class="row">
                                <dt>연락처</dt>
                                <dd>{u().phone || "미등록"}</dd>
                              </div>
                            </dl>

                            <Show when={saved()}>
                              <p class="saved" role="status">
                                <CheckIcon />
                                저장했어요
                              </p>
                            </Show>
                          </div>
                        }
                      >
                        <ProfileForm
                          title="계정 정보 수정"
                          hint="이메일은 변경할 수 없어요."
                          avatar
                          cancellable
                          email={u().email}
                          accountLabel="이메일"
                          initialName={u().name}
                          initialPhone={u().phone ?? ""}
                          onSaved={onSaved}
                          onCancel={() => setEditing(false)}
                        />
                      </Show>
                    </section>
                  </div>

                  <aside class="side side-hide" aria-label="계정 안내">
                    <section class="side-card">
                      <h2>대여 현황</h2>
                      <p>
                        대여 중인 물품은 <b>대여 내역</b>에서 확인할 수 있어요.
                      </p>
                      <a href="/my/rentals">대여 내역 보기</a>
                    </section>

                    <section class="side-card">
                      <h2>연락처 안내</h2>
                      <p>
                        연락처는 물품 대여·반납 안내에만 사용해요. 번호가 바뀌면 내
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
