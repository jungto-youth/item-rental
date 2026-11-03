import { useNavigate, useParams } from "@solidjs/router";
import { Link } from "../components/link";
import { For, Show, createMemo, createSignal, untrack } from "solid-js";
import { AdminGuard } from "../components/admin-guard";
import { CameraIcon, PlusIcon, UploadIcon } from "../components/icons";
import {
  ConfirmModal,
  Modal,
  PageMessage,
  SideCard,
  btnDanger,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";
import { SAMPLE_PHOTO } from "../data/mock";
import { useAppStore } from "../store";
import type { ItemKind, ItemLifecycle } from "../types";

type ConfirmAction = "leave" | "delete";

export default function ItemForm() {
  const store = useAppStore();
  const params = useParams();
  const navigate = useNavigate();

  const mode = createMemo(() => (params.id ? "edit" : "create"));
  const existing = createMemo(() =>
    params.id ? store.findItem(params.id) : undefined,
  );

  // 2.0 은 컴포넌트 본문의 최상위 반응형 읽기를 경고한다 — 초기값은 한 번만 떼어 쓴다.
  const initial = untrack(() => existing());

  const [name, setName] = createSignal(initial?.name ?? "");
  const [location, setLocation] = createSignal(initial?.location ?? "");
  const [description, setDescription] = createSignal(
    initial?.description ?? "",
  );
  const [total, setTotal] = createSignal(initial?.total ?? 1);
  const [repair, setRepair] = createSignal(initial?.repair ?? 0);
  const [tags, setTags] = createSignal<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = createSignal("");
  const [kind, setKind] = createSignal<ItemKind>(initial?.kind ?? "rental");
  const [lifecycle, setLifecycle] = createSignal<ItemLifecycle>(
    initial?.lifecycle ?? "active",
  );
  const [photos, setPhotos] = createSignal<(string | null)[]>(
    [0, 1, 2].map((index) => initial?.photos[index] ?? null),
  );
  const [dirty, setDirty] = createSignal(false);
  const [formError, setFormError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [photoModal, setPhotoModal] = createSignal(false);
  const [confirmAction, setConfirmAction] = createSignal<ConfirmAction | null>(
    null,
  );
  let errorBanner: HTMLDivElement | undefined;

  const filledPhotos = () => photos().filter((src): src is string => !!src);
  const firstPhotoIndex = () => photos().findIndex((src) => !!src);

  const markDirty = () => {
    setDirty(true);
    setFormError("");
    setMessage("");
  };

  const updatePhoto = (index: number, value: string | null) => {
    setPhotos((current) =>
      current.map((src, position) => (position === index ? value : src)),
    );
  };

  const addPhoto = () => {
    const index = photos().findIndex((src) => !src);
    if (index < 0) return;
    updatePhoto(index, SAMPLE_PHOTO);
    setPhotoModal(false);
    markDirty();
  };

  const addTag = () => {
    const value = tagInput().trim().replace(/^#/, "");
    if (!value) return;
    if (!tags().includes(value)) setTags((current) => [...current, value]);
    setTagInput("");
    markDirty();
  };

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((entry) => entry !== tag));
    markDirty();
  };

  const showError = (text: string) => {
    setFormError(text);
    setMessage("");
    queueMicrotask(() => errorBanner?.focus());
  };

  const save = (event: SubmitEvent) => {
    event.preventDefault();
    const itemName = name().trim();
    const totalQty = Number(total());
    const repairQty = Number(repair() || 0);

    if (!itemName) {
      showError("물품 이름을 입력해 주세요.");
      return;
    }
    if (!(totalQty >= 1)) {
      showError("보유 수량을 1 이상 입력해 주세요.");
      return;
    }
    if (kind() === "rental" && repairQty > totalQty) {
      showError("수리중 수량은 보유 수량을 넘을 수 없어요.");
      return;
    }

    const rentedOut = existing()
      ? Math.max(0, existing()!.total - existing()!.available - existing()!.repair)
      : 0;
    const available =
      kind() === "consumable"
        ? totalQty
        : Math.max(0, totalQty - repairQty - rentedOut);

    const patch = {
      name: itemName,
      category: tags()[0] ?? "기타",
      location: location().trim() || "미지정",
      description: description().trim(),
      tags: tags(),
      kind: kind(),
      lifecycle: lifecycle(),
      total: totalQty,
      repair: kind() === "consumable" ? 0 : repairQty,
      available,
      photos: filledPhotos(),
    };

    if (mode() === "edit" && existing()) {
      store.updateItem(existing()!.id, patch);
    } else {
      store.addItem({ id: `item-${Date.now()}`, ...patch });
    }

    setDirty(false);
    setFormError("");
    setMessage(mode() === "edit" ? "수정했어요" : "등록했어요");
  };

  const cancel = () => {
    if (dirty()) setConfirmAction("leave");
    else navigate("/");
  };

  const confirm = () => {
    const action = confirmAction();
    if (!action) return;
    if (action === "delete" && existing()) {
      store.removeItem(existing()!.id);
    }
    setConfirmAction(null);
    navigate("/");
  };

  return (
    <AdminGuard>
      <main class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        <div>
          <h1 class="text-page-title font-bold tracking-[-0.015em] text-ink-1">
            {mode() === "edit" ? "물품 수정" : "물품 등록"}
          </h1>
          <p class="mt-2 text-fine text-ink-2">
            {mode() === "edit"
              ? "물품 정보와 사진을 수정해요."
              : "새 물품의 정보와 사진을 등록해요."}
          </p>
        </div>

        <PageMessage show={message() !== ""}>{message()}</PageMessage>

        <div class="page-split mt-6">
          <div class="page-main">
            <form novalidate onSubmit={save}>
              <Show when={formError() !== ""}>
                <div
                  ref={errorBanner}
                  class="mb-4 rounded-card border border-danger bg-danger-soft px-4 py-2 text-fine text-danger"
                  role="alert"
                  tabindex="-1"
                >
                  {formError()}
                </div>
              </Show>

              <section class="rounded-card border border-line bg-surface p-6 max-sm:p-4">
                <h2 class="border-b border-line pb-2 text-heading font-semibold tracking-[-0.015em] text-ink-1">
                  기본 정보
                </h2>

                <label class="mt-4 block">
                  <span class="text-fine font-medium text-ink-2">
                    이름 <span class="text-danger">*</span>
                  </span>
                  <input
                    value={name()}
                    placeholder="예: 4인용 텐트"
                    class={`${inputClass} mt-2 ${formError() && !name().trim() ? "is-invalid" : ""}`}
                    onInput={(event) => {
                      setName(event.currentTarget.value);
                      markDirty();
                    }}
                  />
                </label>

                <label class="mt-4 block">
                  <span class="text-fine font-medium text-ink-2">
                    보관 위치
                  </span>
                  <input
                    value={location()}
                    placeholder="예: 7층 비품실, 2층 OA실"
                    class={`${inputClass} mt-2`}
                    onInput={(event) => {
                      setLocation(event.currentTarget.value);
                      markDirty();
                    }}
                  />
                </label>

                <label class="mt-4 block">
                  <span class="text-fine font-medium text-ink-2">설명</span>
                  <textarea
                    rows="3"
                    value={description()}
                    placeholder="물품 설명이나 주의사항을 적어주세요"
                    class="field-input mt-2 min-h-[88px] w-full resize-y rounded-card border border-line bg-surface px-4 py-2 text-body text-ink-1 placeholder:text-ink-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    onInput={(event) => {
                      setDescription(event.currentTarget.value);
                      markDirty();
                    }}
                  />
                </label>
              </section>

              <section class="mt-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
                <h2 class="border-b border-line pb-2 text-heading font-semibold tracking-[-0.015em] text-ink-1">
                  분류 · 상태
                </h2>

                <div class="mt-4">
                  <span class="text-fine font-medium text-ink-2">카테고리</span>
                  <div class="mt-2 flex min-h-10 flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <For each={tags()}>
                      {(tag) => (
                        <span class="inline-flex h-7 items-center gap-1 rounded-pill bg-primary-soft px-2 text-fine text-primary-strong">
                          #{tag}
                          <button
                            type="button"
                            class="flex h-6 w-6 items-center justify-center rounded-pill text-primary-strong/70 transition-colors hover:text-primary-strong"
                            aria-label={`${tag} 태그 제거`}
                            onClick={() => removeTag(tag)}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </For>
                    <input
                      value={tagInput()}
                      placeholder="태그 입력 후 엔터 (예: 캠핑, 취미)"
                      class="h-8 min-w-[160px] flex-1 border-0 bg-transparent px-2 text-body text-ink-1 placeholder:text-ink-2 focus:outline-none"
                      onInput={(event) => setTagInput(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.isComposing) return;
                        event.preventDefault();
                        addTag();
                      }}
                    />
                  </div>
                </div>

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <span class="text-fine font-medium text-ink-2">구분</span>
                    <div class="mt-2 flex gap-2" role="group" aria-label="구분">
                      <For
                        each={
                          [
                            ["rental", "대여품"],
                            ["consumable", "소모품"],
                          ] as [ItemKind, string][]
                        }
                      >
                        {([value, label]) => (
                          <button
                            type="button"
                            class="choice-chip"
                            aria-pressed={kind() === value ? "true" : "false"}
                            onClick={() => {
                              setKind(value);
                              markDirty();
                            }}
                          >
                            {label}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                  <div>
                    <span class="text-fine font-medium text-ink-2">상태</span>
                    <div class="mt-2 flex gap-2" role="group" aria-label="상태">
                      <For
                        each={
                          [
                            ["active", "사용"],
                            ["retired", "폐기"],
                          ] as [ItemLifecycle, string][]
                        }
                      >
                        {([value, label]) => (
                          <button
                            type="button"
                            class="choice-chip"
                            aria-pressed={lifecycle() === value ? "true" : "false"}
                            onClick={() => {
                              setLifecycle(value);
                              markDirty();
                            }}
                          >
                            {label}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </section>

              <section class="mt-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
                <h2 class="border-b border-line pb-2 text-heading font-semibold tracking-[-0.015em] text-ink-1">
                  재고 · 사진
                </h2>

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-fine font-medium text-ink-2">
                      보유 수량 <span class="text-danger">*</span>
                    </span>
                    <input
                      type="number"
                      inputmode="numeric"
                      min="1"
                      value={total()}
                      class={`${inputClass} mt-2 tabular-nums ${formError() && !(total() >= 1) ? "is-invalid" : ""}`}
                      onInput={(event) => {
                        setTotal(Number(event.currentTarget.value));
                        markDirty();
                      }}
                    />
                  </label>
                  <Show when={kind() === "rental"}>
                    <label class="block">
                      <span class="text-fine font-medium text-ink-2">
                        수리중 수량
                      </span>
                      <input
                        type="number"
                        inputmode="numeric"
                        min="0"
                        value={repair()}
                        class={`${inputClass} mt-2 tabular-nums ${formError() && repair() > total() ? "is-invalid" : ""}`}
                        onInput={(event) => {
                          setRepair(Number(event.currentTarget.value));
                          markDirty();
                        }}
                      />
                    </label>
                  </Show>
                </div>
                <Show when={kind() === "rental"}>
                  <p class="mt-2 text-fine text-ink-2">
                    수리중 수량은 대여 불가 수량이에요 (보유 수량을 넘을 수 없어요)
                  </p>
                </Show>

                <div class="mt-6 flex items-center justify-between gap-4">
                  <span class="text-fine font-medium text-ink-2">사진 관리</span>
                  <span class="text-fine tabular-nums text-ink-2">
                    {filledPhotos().length} / 3
                  </span>
                </div>

                <div class="mt-2 grid grid-cols-3 gap-2">
                  <For each={photos()}>
                    {(src, index) => (
                      <div
                        class={`relative aspect-[4/3] overflow-hidden rounded-card border ${
                          src
                            ? "border-line bg-surface-muted"
                            : "border-dashed border-line-strong bg-surface"
                        }`}
                      >
                        <Show
                          when={src}
                          fallback={
                            <button
                              type="button"
                              class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              aria-label="사진 추가"
                              onClick={() => setPhotoModal(true)}
                            >
                              <PlusIcon class="h-5 w-5" />
                              <span class="text-fine">사진 추가</span>
                            </button>
                          }
                        >
                          {(source) => (
                            <>
                              <img
                                src={source()}
                                alt=""
                                class="h-full w-full object-cover"
                              />
                              <Show when={index() === firstPhotoIndex()}>
                                <span class="absolute left-2 top-2 inline-flex h-6 items-center rounded-pill bg-primary-soft px-2 text-fine font-medium text-primary-strong">
                                  대표
                                </span>
                              </Show>
                              <button
                                type="button"
                                class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-pill bg-ink-1/70 text-white hover:bg-ink-1"
                                aria-label="사진 삭제"
                                onClick={() => {
                                  updatePhoto(index(), null);
                                  markDirty();
                                }}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>

                <p class="mt-2 text-fine text-ink-2">
                  사진 추가·삭제는 저장할 때 함께 반영돼요. 첫 사진이 대표
                  사진이에요.
                </p>
              </section>

              <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Show when={mode() === "edit"}>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      class={btnDanger}
                      onClick={() => setConfirmAction("delete")}
                    >
                      물품 삭제
                    </button>
                    <Link
                      href={
                        existing() ? `/items/${existing()!.id}` : "/"
                      }
                      class={btnSecondary}
                    >
                      공개 보기
                    </Link>
                  </div>
                </Show>
                <div class="flex justify-end gap-2 sm:ml-auto">
                  <button type="button" class={btnSecondary} onClick={cancel}>
                    취소
                  </button>
                  <button type="submit" class={btnPrimary}>
                    저장
                  </button>
                </div>
              </div>
            </form>
          </div>

          <aside class="page-side page-side-hide" aria-label="물품 등록 안내">
            <SideCard title="작성 안내">
              이름과 보유 수량은 필수예요. 수리중 수량은 대여할 수 없는 수량이라
              보유 수량을 넘을 수 없어요.
            </SideCard>
            <SideCard title="사진 안내">
              사진은 최대 3장까지 등록할 수 있어요. 첫 사진이 대표 사진이 되고,
              추가·삭제는 저장할 때 함께 반영돼요.
            </SideCard>
          </aside>
        </div>

        <Modal
          open={photoModal()}
          onClose={() => setPhotoModal(false)}
          title="사진 추가"
          description="사진을 추가할 방법을 선택하세요."
          footer={
            <button
              type="button"
              class="w-full text-center text-fine text-ink-2 underline underline-offset-2 transition-colors hover:text-ink-1"
              onClick={() => setPhotoModal(false)}
            >
              닫기
            </button>
          }
        >
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class={btnSecondary}
              onClick={addPhoto}
            >
              <CameraIcon class="mr-2 h-4 w-4" />
              사진 촬영
            </button>
            <button type="button" class={btnPrimary} onClick={addPhoto}>
              <UploadIcon class="mr-2 h-4 w-4" />
              사진 업로드
            </button>
          </div>
        </Modal>

        <ConfirmModal
          open={confirmAction() !== null}
          title={
            confirmAction() === "delete"
              ? `'${name().trim() || "물품"}' 물품을 정말 삭제할까요?`
              : "저장하지 않은 변경이 있어요."
          }
          description={
            confirmAction() === "delete"
              ? "연결된 대여 이력은 남고 복구할 수 없어요."
              : "떠나면 변경 사항이 사라져요."
          }
          confirmLabel={confirmAction() === "delete" ? "삭제" : "나가기"}
          cancelLabel={
            confirmAction() === "delete" ? "닫기" : "계속 수정"
          }
          danger={confirmAction() === "delete"}
          onConfirm={confirm}
          onClose={() => setConfirmAction(null)}
        />
      </main>
    </AdminGuard>
  );
}
