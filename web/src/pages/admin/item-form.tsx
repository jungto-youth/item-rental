import {
  For,
  Show,
  createEffect,
  createSignal,
  onSettled,
  untrack,
} from "solid-js";
import { api, ApiError } from "../../api/client";
import { navigate } from "../../router";
import { confirmDialog } from "../../utils/confirm";
import { fmtKstDate } from "../../utils/date";
import { getCategories, resolveCategoryIds } from "../../utils/categories";
import { processPhoto } from "../../utils/photo";
import { MAX_PHOTOS } from "../../../../shared/photo-limits";
import type {
  AdminInventoryAdjustment,
  InventoryAdjustmentKind,
  Item,
  ItemKind,
  ItemLifecycle,
  Photo,
} from "../../types";
import { AdminPage } from "../../components/admin/admin-page";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Input } from "../../components/ui/input";
import { CategoryTagsInput } from "../../components/features/category/category-tags-input";
import {
  PhotoUploader,
  type PhotoEntry,
} from "../../components/features/item/photo-uploader";

type ItemFormModel = {
  name: string;
  kind: ItemKind;
  total_qty: number;
  qty_repair: number;
  lifecycle: ItemLifecycle;
  location: string;
  description: string;
};

const EMPTY_FORM: ItemFormModel = {
  name: "",
  kind: "rental",
  total_qty: 1,
  qty_repair: 0,
  lifecycle: "active",
  location: "",
  description: "",
};

type AdminItemDetail = {
  id: number;
  name: string;
  kind?: ItemKind;
  total_qty?: number;
  qty_repair?: number;
  lifecycle?: ItemLifecycle;
  location?: string | null;
  description?: string | null;
  categories?: { id: number; name: string }[];
};

type StagedPhoto = { file: File; url: string };

const ADJUSTMENT_LABELS: Record<InventoryAdjustmentKind, string> = {
  add: "추가",
  lost: "망실",
  dispose: "폐기",
};

const ADJUSTMENT_OPTIONS = [
  { value: "add", label: "추가" },
  { value: "lost", label: "망실" },
  { value: "dispose", label: "폐기" },
];

export default function AdminItemForm(props: { params: Record<string, string> }) {
  const [form, setForm] = createSignal<ItemFormModel>({ ...EMPTY_FORM });
  const [photos, setPhotos] = createSignal<Photo[]>([]);
  const [removedIds, setRemovedIds] = createSignal<number[]>([]);
  const [staged, setStaged] = createSignal<StagedPhoto[]>([]);
  const [tagNames, setTagNames] = createSignal<string[]>([]);
  const [categoryOptions, setCategoryOptions] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [processingPhotos, setProcessingPhotos] = createSignal(false);
  const [error, setFormError] = createSignal("");
  const [createdId, setCreatedId] = createSignal<number | null>(null);

  const [adjustments, setAdjustments] = createSignal<AdminInventoryAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = createSignal(false);
  const [adjustKind, setAdjustKind] = createSignal<InventoryAdjustmentKind>("add");
  const [adjustQty, setAdjustQty] = createSignal("1");
  const [adjustMemo, setAdjustMemo] = createSignal("");
  const [adjusting, setAdjusting] = createSignal(false);
  const [adjustError, setAdjustError] = createSignal("");
  const [adjustMessage, setAdjustMessage] = createSignal("");

  let loadGen = 0;
  let photoGeneration = 0;
  let baseline = "";
  let errorBanner: HTMLParagraphElement | undefined;

  const itemId = () => props.params.id ?? "new";
  const isCreate = () => itemId() === "new" && createdId() === null;
  const targetId = () =>
    createdId() === null ? itemId() : String(createdId());

  const snapshot = () =>
    JSON.stringify({
      f: form(),
      t: [...tagNames()].sort(),
      p: staged().length,
      r: [...removedIds()].sort(),
    });

  const dirty = () => baseline !== "" && snapshot() !== baseline;
  const commitBaseline = () => {
    baseline = snapshot();
  };

  const setField = <K extends keyof ItemFormModel>(
    key: K,
    value: ItemFormModel[K],
  ) => {
    setForm({ ...form(), [key]: value });
  };

  const setError = (text: string) => {
    setFormError(text);
    queueMicrotask(() => errorBanner?.focus());
  };

  const loadCategoryOptions = async () => {
    try {
      setCategoryOptions((await getCategories()).map((category) => category.name));
    } catch {
      setCategoryOptions([]);
    }
  };

  const loadAdjustments = async (id: number | string) => {
    setAdjustmentsLoading(true);
    try {
      const res = await api<{ adjustments: AdminInventoryAdjustment[] }>(
        `/api/admin/items/${id}/adjustments`,
      );
      setAdjustments(res.adjustments);
    } catch {
      setAdjustments([]);
    } finally {
      setAdjustmentsLoading(false);
    }
  };

  const loadItem = async (gen: number) => {
    try {
      const [detailRes, publicRes] = await Promise.all([
        api<{ item: AdminItemDetail }>(`/api/admin/items/${itemId()}`),
        api<{ item: Item }>(`/api/items/${itemId()}`).catch(() => null),
      ]);
      if (gen !== loadGen) return;
      const item = detailRes.item;
      setForm({
        name: item.name,
        kind: item.kind ?? "rental",
        total_qty: item.total_qty ?? 1,
        qty_repair: item.qty_repair ?? 0,
        lifecycle: item.lifecycle ?? "active",
        location: item.location ?? "",
        description: item.description ?? "",
      });
      setTagNames((item.categories ?? []).map((category) => category.name));
      setPhotos(publicRes?.item.photos ?? []);
      setLoading(false);
      commitBaseline();
      void loadAdjustments(itemId());
    } catch (err) {
      if (gen !== loadGen) return;
      setLoading(false);
      setLoadError(
        err instanceof Error ? err.message : "물품 정보를 불러오지 못했어요",
      );
    }
  };

  const clearStaged = () => {
    photoGeneration++;
    setProcessingPhotos(false);
    for (const entry of staged()) URL.revokeObjectURL(entry.url);
    setStaged([]);
  };

  const init = () => {
    const gen = ++loadGen;
    setForm({ ...EMPTY_FORM });
    setTagNames([]);
    setPhotos([]);
    setRemovedIds([]);
    clearStaged();
    setFormError("");
    setCreatedId(null);
    setLoadError("");
    setAdjustments([]);
    setAdjustError("");
    setAdjustMessage("");
    setAdjustQty("1");
    setAdjustMemo("");
    baseline = "";
    void loadCategoryOptions();
    if (itemId() === "new") {
      setLoading(false);
      commitBaseline();
      return;
    }
    setLoading(true);
    void loadItem(gen);
  };

  createEffect(
    () => itemId(),
    (id) => {
      if (id) untrack(init);
    },
  );

  const confirmLeave = async () => {
    if (!dirty()) return true;
    return await confirmDialog("", {
      title: "저장하지 않은 변경이 있어요.",
      description: "떠나면 변경 사항이 사라져요.",
      confirmLabel: "나가기",
      cancelLabel: "계속 수정",
      danger: true,
    });
  };

  onSettled(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearStaged();
    };
  });

  const photoCount = () =>
    photos().length - removedIds().length + staged().length;

  const photoEntries = (): PhotoEntry[] => {
    const kept = photos()
      .filter((photo) => !removedIds().includes(photo.id))
      .map((photo) => ({ url: photo.url, key: photo.id }));
    const fresh = staged().map((entry, index) => ({
      url: entry.url,
      key: `s${index}`,
    }));
    return [...kept, ...fresh];
  };

  const stagePhotos = async (files: File[]) => {
    if (processingPhotos() || saving()) return;
    setProcessingPhotos(true);
    setFormError("");
    const generation = photoGeneration;
    try {
      for (const file of files) {
        if (photoCount() >= MAX_PHOTOS) {
          setError(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있어요`);
          break;
        }
        try {
          const processed = await processPhoto(file);
          if (generation !== photoGeneration) return;
          setStaged([
            ...staged(),
            { file: processed, url: URL.createObjectURL(processed) },
          ]);
        } catch (err) {
          if (generation !== photoGeneration) return;
          setError(err instanceof Error ? err.message : "이미지 처리 실패");
        }
      }
    } finally {
      if (generation === photoGeneration) setProcessingPhotos(false);
    }
  };

  const removeStaged = (index: number) => {
    URL.revokeObjectURL(staged()[index].url);
    setStaged(staged().filter((_, i) => i !== index));
  };

  const onPhotoUpload = (files: File[]) => {
    if (files.length === 0) return;
    void stagePhotos(files);
  };

  const onPhotoRemove = (key: string | number) => {
    if (typeof key === "string" && key.startsWith("s")) {
      removeStaged(Number(key.slice(1)));
    } else {
      const id = Number(key);
      if (!removedIds().includes(id)) setRemovedIds([...removedIds(), id]);
    }
  };

  const flushPhotos = async (id: number | string): Promise<string[]> => {
    const failed: string[] = [];
    const remainingRemovals: number[] = [];
    for (const photoId of removedIds()) {
      try {
        await api(`/api/admin/items/${id}/photos/${photoId}`, {
          method: "DELETE",
        });
      } catch {
        remainingRemovals.push(photoId);
        failed.push("사진 삭제");
      }
    }

    const remainingStaged: StagedPhoto[] = [];
    for (const entry of staged()) {
      const data = new FormData();
      data.append("file", entry.file);
      try {
        await api(`/api/admin/items/${id}/photos`, {
          method: "POST",
          body: data,
        });
        URL.revokeObjectURL(entry.url);
      } catch {
        remainingStaged.push(entry);
        failed.push(entry.file.name);
      }
    }

    setRemovedIds(remainingRemovals);
    setStaged(remainingStaged);
    return failed;
  };

  const handleSave = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving() || processingPhotos()) return;
    if (!form().name.trim()) {
      setError("물품 이름을 입력해 주세요.");
      return;
    }
    if (!(form().total_qty >= 1)) {
      setError("보유 수량을 1 이상 입력해 주세요.");
      return;
    }
    if (form().kind === "rental" && form().qty_repair > form().total_qty) {
      setError("수리 중 수량은 보유 수량을 넘을 수 없어요.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const category_ids = await resolveCategoryIds(tagNames());
      let id: number | string;
      if (isCreate()) {
        const res = await api<{ id: number }>("/api/admin/items", {
          method: "POST",
          body: JSON.stringify({ ...form(), category_ids }),
        });
        id = res.id;
        setCreatedId(res.id);
      } else {
        await api(`/api/admin/items/${targetId()}`, {
          method: "PUT",
          body: JSON.stringify({ ...form(), category_ids }),
        });
        id = targetId();
      }
      const failed = await flushPhotos(id);
      if (failed.length > 0) {
        setError(
          `물품은 저장됐어요. 사진 처리만 실패했어요: ${failed.join(", ")}`,
        );
        return;
      }
      commitBaseline();
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isCreate()
            ? "물품 등록에 실패했어요"
            : "수정 저장에 실패했어요",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (event: SubmitEvent) => {
    event.preventDefault();
    if (adjusting() || isCreate()) return;

    const qty = Number(adjustQty());
    if (!Number.isInteger(qty) || qty < 1) {
      setAdjustError("수량을 1 이상 입력해 주세요.");
      setAdjustMessage("");
      return;
    }

    setAdjusting(true);
    setAdjustError("");
    setAdjustMessage("");
    try {
      const res = await api<{ ok: true; total_qty: number }>(
        `/api/admin/items/${targetId()}/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: adjustKind(),
            qty,
            memo: adjustMemo().trim() || undefined,
          }),
        },
      );
      // 저장된 보유 수량에 즉시 반영된다. 폼에 다른 미저장 변경이 있으면 dirty 를 유지하고,
      // 없으면 새 수량을 기준선으로 삼아 "저장 안 됨" 표시가 생기지 않게 한다.
      const wasDirty = dirty();
      const next = { ...form(), total_qty: res.total_qty };
      setForm(next);
      if (!wasDirty) {
        baseline = JSON.stringify({
          f: next,
          t: [...tagNames()].sort(),
          p: staged().length,
          r: [...removedIds()].sort(),
        });
      }
      setAdjustQty("1");
      setAdjustMemo("");
      setAdjustMessage(
        `${ADJUSTMENT_LABELS[adjustKind()]} ${qty}개를 반영했어요. 현재 보유 ${res.total_qty}개`,
      );
      await loadAdjustments(targetId());
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "rented_qty_constraint") {
        setAdjustError("대여 중인 수량보다 적게 줄일 수 없어요.");
      } else if (code === "repair_qty_constraint") {
        setAdjustError("수리 중 수량보다 적게 줄일 수 없어요.");
      } else if (code === "min_qty") {
        setAdjustError(
          "보유 수량은 1개 이상이어야 해요. 물품을 폐기하려면 상태를 폐기로 바꿔 주세요.",
        );
      } else if (code === "conflict") {
        setAdjustError("다른 변경이 있었어요. 새로고침 후 다시 시도해 주세요.");
      } else {
        setAdjustError(
          err instanceof Error ? err.message : "수량을 조정하지 못했어요.",
        );
      }
    } finally {
      setAdjusting(false);
    }
  };

  const handleDelete = async () => {
    if (
      !(await confirmDialog("", {
        title: `'${form().name.trim() || "물품"}' 물품을 정말 삭제할까요?`,
        description: "연결된 대여 이력은 남고 복구할 수 없어요.",
        confirmLabel: "삭제",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/items/${targetId()}`, { method: "DELETE" });
      baseline = "";
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const handleCancel = async () => {
    if (!(await confirmLeave())) return;
    baseline = "";
    navigate("/");
  };

  return (
    <AdminPage
      title={isCreate() ? "물품 등록" : "물품 수정"}
      subtitle={
        isCreate()
          ? "새 물품의 정보와 사진을 등록해요."
          : "물품 정보와 사진을 수정해요."
      }
      loading={loading()}
      error={loadError()}
      onRetry={init}
      side
      sideContent={
        <>
          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">작성 안내</h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              이름과 보유 수량은 필수예요. 수리 중 수량은 대여할 수 없는 수량이라
              보유 수량을 넘을 수 없어요.
            </p>
          </section>
          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">사진 안내</h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              사진은 최대 3장까지 등록할 수 있어요. 첫 사진이 대표 사진이 되고,
              추가·삭제는 저장할 때 함께 반영돼요.
            </p>
          </section>
        </>
      }
    >
      <div class="max-w-full">
        <form class="flex flex-col gap-4" onSubmit={handleSave}>
          <Show when={error()}>
            <p class="m-0 rounded-card border border-danger bg-danger-soft px-4 py-2 text-fine leading-normal text-danger" role="alert" tabindex="-1" ref={errorBanner}>
              {error()}
            </p>
          </Show>

          <section class="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
            <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">기본 정보</h2>
            <Input
              label="이름 *"
              value={form().name}
              onInput={(value) => setField("name", value)}
            />
            <Input
              label="보관 위치"
              placeholder="예: 7층 비품실, 2층 OA실"
              value={form().location}
              onInput={(value) => setField("location", value)}
            />
            <Input
              label="설명"
              type="textarea"
              rows={3}
              placeholder="물품 설명이나 주의사항을 적어주세요"
              value={form().description}
              onInput={(value) => setField("description", value)}
            />
          </section>

          <section class="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
            <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">분류 · 상태</h2>
            <span class="flex flex-col gap-2 text-fine font-normal text-ink-2">
              카테고리
              <CategoryTagsInput
                value={tagNames()}
                options={categoryOptions()}
                placeholder="태그 입력 후 엔터 (예: 캠핑, 취미)"
                onChange={setTagNames}
              />
            </span>

            <div class="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
              <span class="flex flex-col gap-2 text-fine font-normal text-ink-2">
                구분
                <Chip
                  ariaLabel="구분"
                  value={form().kind}
                  options={[
                    { value: "rental", label: "대여품" },
                    { value: "consumable", label: "소모품" },
                  ]}
                  onChange={(value) => setField("kind", value as ItemKind)}
                />
              </span>
              <span class="flex flex-col gap-2 text-fine font-normal text-ink-2">
                상태
                <Chip
                  ariaLabel="상태"
                  value={form().lifecycle}
                  options={[
                    { value: "active", label: "사용" },
                    { value: "retired", label: "폐기" },
                  ]}
                  onChange={(value) =>
                    setField("lifecycle", value as ItemLifecycle)
                  }
                />
              </span>
            </div>
          </section>

          <section class="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-6 max-sm:p-4">
            <h2 class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1">재고 · 사진</h2>
            <div class="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
              <Input
                label="보유 수량 *"
                type="number"
                inputmode="numeric"
                min="1"
                value={String(form().total_qty)}
                onInput={(value) => setField("total_qty", Number(value))}
              />
              <Show when={form().kind === "rental"}>
                <Input
                  label="수리 중 수량"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  value={String(form().qty_repair)}
                  onInput={(value) => setField("qty_repair", Number(value))}
                />
              </Show>
            </div>
            <Show when={form().kind === "rental"}>
              <p class="m-0 text-fine text-ink-2">
                수리 중 수량은 대여 불가 수량이에요 (보유 수량을 넘을 수 없어요)
              </p>
            </Show>

            <PhotoUploader
              multiple
              disabled={processingPhotos() || saving()}
              entries={photoEntries()}
              onUpload={onPhotoUpload}
              onRemove={onPhotoRemove}
            />
            <Show when={processingPhotos()}>
              <p class="text-fine text-ink-2" role="status">사진을 축소하고 있어요…</p>
            </Show>
            <p class="m-0 text-fine text-ink-2">
              사진 추가·삭제는 저장할 때 함께 반영돼요. 첫 사진이 대표 사진이에요.
            </p>
          </section>

          <div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <Show when={!isCreate()}>
                <Button variant="danger" type="button" onClick={() => void handleDelete()}>
                  물품 삭제
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => navigate(`/items/${targetId()}`)}
                >
                  공개 보기
                </Button>
              </Show>
            </div>
            <div class="flex shrink-0 justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleCancel()}
              >
                취소
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={saving()}
                disabled={processingPhotos()}
              >
                저장
              </Button>
            </div>
          </div>
        </form>

        <Show when={!isCreate()}>
          <section
            class="mt-8 box-border rounded-card border border-line bg-surface p-6 max-sm:p-4"
            aria-labelledby="adjust-title"
          >
            <h2
              id="adjust-title"
              class="m-0 text-heading leading-normal font-semibold tracking-tight text-ink-1"
            >
              수량 조정
            </h2>
            <p class="mt-2 m-0 text-fine leading-normal text-ink-2">
              추가·망실·폐기를 이력으로 남겨요. 저장된 보유 수량에 바로 적용되고,
              이름·사진 같은 다른 변경은 위 저장 버튼으로 반영해요.
            </p>

            <form class="mt-4 flex flex-col gap-4" onSubmit={handleAdjust}>
              <div class="grid gap-4 min-[720px]:grid-cols-2">
                <span class="flex flex-col gap-2 text-fine font-normal text-ink-2">
                  구분
                  <Chip
                    ariaLabel="수량 조정 구분"
                    value={adjustKind()}
                    options={ADJUSTMENT_OPTIONS}
                    onChange={(value) =>
                      setAdjustKind(value as InventoryAdjustmentKind)
                    }
                  />
                </span>
                <Input
                  label="수량 *"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  value={adjustQty()}
                  onInput={setAdjustQty}
                />
              </div>
              <Input
                label="사유 메모 (선택)"
                placeholder="예: 신규 구입, 파손 폐기"
                value={adjustMemo()}
                onInput={setAdjustMemo}
              />

              <Show when={adjustError()}>
                <p class="m-0 text-fine leading-normal text-danger" role="alert">
                  {adjustError()}
                </p>
              </Show>
              <Show when={adjustMessage()}>
                <p class="m-0 text-fine leading-normal text-ink-2" role="status">
                  {adjustMessage()}
                </p>
              </Show>

              <div class="flex justify-end">
                <Button variant="secondary" type="submit" loading={adjusting()}>
                  수량 조정
                </Button>
              </div>
            </form>

            <div class="mt-8">
              <h3 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">
                조정 이력
              </h3>
              <Show
                when={!adjustmentsLoading()}
                fallback={
                  <p class="mt-2 m-0 text-fine text-ink-2" role="status">
                    조정 이력을 불러오는 중…
                  </p>
                }
              >
                <Show
                  when={adjustments().length > 0}
                  fallback={
                    <p class="mt-2 m-0 text-fine text-ink-2">
                      아직 조정 이력이 없어요.
                    </p>
                  }
                >
                  <ul class="mt-4 m-0 grid list-none gap-2 p-0">
                    <For each={adjustments()}>
                      {(entry) => (
                        <li class="box-border rounded-card border border-line bg-surface-muted px-4 py-2 text-fine leading-normal text-ink-2">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="font-semibold text-ink-1">
                              {ADJUSTMENT_LABELS[entry.kind]} {entry.qty}개
                            </span>
                            <span>{fmtKstDate(entry.created_at)}</span>
                          </div>
                          <p class="m-0 mt-2">
                            보유 {entry.total_qty_before} → {entry.total_qty_after}
                            {entry.actor_name ? ` · ${entry.actor_name}` : ""}
                          </p>
                          <Show when={entry.memo}>
                            <p class="m-0 mt-2">사유: {entry.memo}</p>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </div>
          </section>
        </Show>
      </div>
    </AdminPage>
  );
}
