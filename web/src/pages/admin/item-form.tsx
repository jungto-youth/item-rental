import {
  Show,
  createEffect,
  createSignal,
  onSettled,
  untrack,
} from "solid-js";
import { api } from "../../api/client";
import { navigate } from "../../router";
import { confirmDialog } from "../../utils/confirm";
import { getCategories, resolveCategoryIds } from "../../utils/categories";
import { processPhoto } from "../../utils/photo";
import { MAX_PHOTOS } from "../../../../shared/photo-limits";
import type { Item, ItemKind, ItemLifecycle, Photo } from "../../types";
import { AdminPage } from "../../components/admin/admin-page";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Input } from "../../components/ui/input";
import { TextButton } from "../../components/ui/text-button";
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

  // 공개 보기 — 폼 액션이 아니라 이동이지만, 미저장 변경은 취소와 같은
  // 기준으로 보호한다 (지금까지는 확인 없이 바로 이동했다).
  const handlePublicView = async () => {
    if (!(await confirmLeave())) return;
    navigate(`/items/${targetId()}`);
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
      action={
        <Show when={!isCreate()}>
          <TextButton onClick={() => void handlePublicView()}>
            공개 보기
          </TextButton>
        </Show>
      }
      side
      sideContent={
        <>
          <section class="rounded-card border border-line bg-surface p-4">
            <h2 class="m-0 text-body leading-normal font-semibold tracking-tight text-ink-1">작성 안내</h2>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              이름과 보유 수량은 필수예요. 수리 중 수량은 대여할 수 없는 수량이라
              보유 수량을 넘을 수 없어요.
            </p>
            <p class="mt-2 text-fine leading-normal text-ink-2">
              보유 수량을 직접 바꾸면 이력이 남지 않아요. 추가·망실·폐기는 물품
              상세의 ‘수량 조정’에서 처리해 주세요.
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

          <div class="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-2 border-t border-line bg-surface pt-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            <Show when={!isCreate()}>
              <TextButton
                tone="danger"
                disabled={saving() || processingPhotos()}
                onClick={() => void handleDelete()}
              >
                물품 삭제
              </TextButton>
            </Show>
            <div class="ml-auto flex shrink-0 justify-end gap-2">
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
      </div>
    </AdminPage>
  );
}
