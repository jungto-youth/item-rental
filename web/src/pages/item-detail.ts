import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../api/client";
import { session, type SessionUser } from "../context/session";
import "../components/ui/badge";
import "../components/ui/availability-strip";
import "../components/ui/x-calendar";
import { MAX_PHOTO_BYTES, PHOTO_OK, processPhoto } from "../utils/photo";
import {
  type AvailabilityDay,
  type Item,
  type ItemKind,
  type ItemStatus,
  type Photo,
} from "../types";
import { reduceMotion } from "../styles/motion";

// SPEC §5 — 물품 상세 + 대여 신청 폼 (§4.3, 원자적 INSERT는 서버 §8)
// 운영진(admin)은 이 화면에서 바로 편집·사진 관리 — 별도 관리 화면 없음 (DESIGN 통합안)
@customElement("page-item-detail")
export class PageItemDetail extends LitElement {
  @property()
  private itemId = "";
  @state()
  private item: Item | null = null;
  @state()
  private availability: AvailabilityDay[] = [];
  @state()
  private photoIdx = 0;
  @state()
  private error = "";

  // 신청 폼
  @state()
  private user: SessionUser | null = null;
  @state()
  private userReady = false;
  @state()
  private startDate = "";
  @state()
  private endDate = "";
  @state()
  private memo = "";
  // 부분 대여 수량 (§8 P0) — 한 예약이 여러 개를 점유한다. 기본 1개.
  // 날짜가 바뀌면 기간 잔여가 달라지므로 날짜 선택 때마다 1로 되돌린다
  @state()
  private qty = 1;
  @state()
  private saving = false;
  @state()
  private formMsg = "";
  @state()
  private formOk = false;

  // 편집 모드 (운영진 전용)
  @state()
  private editing = false;
  @state()
  private editForm = {
    name: "",
    kind: "rental" as ItemKind,
    total_qty: 1,
    qty_broken: 0,
    max_days: 7,
    status: "active" as ItemStatus,
    location: "",
    size: "",
    color: "",
    note: "",
    description: "",
  };
  @state()
  private editPhotos: Photo[] = [];
  @state()
  private editSaving = false;
  @state()
  private editMsg = "";

  static styles = [
    reduceMotion,
    css`
      .photo {
        aspect-ratio: 4 / 3;
        border-radius: var(--radius);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        overflow: hidden;
      }
      .photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .thumbs {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-2);
      }
      .thumbs button {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-sm);
        border: 2px solid transparent;
        padding: 0;
        overflow: hidden;
        cursor: pointer;
        background: var(--color-surface);
      }
      .thumbs button.on {
        border-color: var(--color-primary-focus);
      } /* DESIGN.md §5 — 선택 상태 2px 링 */
      .thumbs img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
        margin: var(--space-4) 0 var(--space-2);
      }
      .desc {
        line-height: 1.47;
        white-space: pre-wrap;
      }
      .spec {
        display: flex;
        gap: var(--space-6);
        margin: var(--space-4) 0;
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: var(--text-body);
      }
      .spec b {
        display: block;
        color: var(--color-muted);
        font-weight: 400;
        font-size: var(--text-fine);
      }
      /* 실물 속성 — 값이 있는 항목만. 좁은 화면에선 한 열로 접힌다 */
      .attrs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--space-3) var(--space-5);
        margin: 0 0 var(--space-4);
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: var(--text-body);
      }
      .attrs dt {
        color: var(--color-muted);
        font-weight: 400;
        font-size: var(--text-fine);
      }
      .attrs dd {
        margin: 0;
        white-space: pre-wrap;
      }
      .strip-label {
        font-size: var(--text-caption);
        color: var(--color-muted);
        margin-bottom: var(--space-2);
      }
      .apply-form {
        margin-top: var(--space-4);
        padding: var(--space-5);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        display: grid;
        gap: var(--space-3);
      }
      .apply-form h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      input,
      textarea {
        font: inherit;
        font-size: 1rem; /* iOS 줌 방지 */
        padding: 0 var(--space-3);
        height: 44px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm); /* DESIGN.md §5 — 입력 필 유틸 8px */
        background: var(--color-bg); /* 화이트 카드 위 파치먼트 fill */
        color: inherit;
        box-sizing: border-box;
        width: 100%;
      }
      textarea {
        height: auto;
        min-height: 72px;
        padding: var(--space-3);
        resize: vertical;
      }
      input:focus,
      textarea:focus {
        outline: none;
        border-color: var(--color-primary);
      }
      .memo {
        display: grid;
        gap: 4px;
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      .qty {
        display: grid;
        gap: 4px;
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      .qty input {
        max-width: 8rem;
      }
      .qty-hint {
        font-size: var(--text-fine);
      }
      .hint-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .hint {
        margin: 0;
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      /* '다시 선택' — 힌트 옆 텍스트 링크. 탭만으론 빈 선택으로 못 돌아가는 보완 */
      .clear {
        position: relative;
        flex-shrink: 0;
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-primary);
        font: inherit;
        font-size: var(--text-caption);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      /* DESIGN.md §1 — 시각은 텍스트 링크 그대로, 히트 영역만 상하로 넓혀 44px에 맞춤 */
      .clear::after {
        content: "";
        position: absolute;
        inset: -13px -6px;
      }
      .clear:active {
        transform: scale(0.95);
      }
      /* DESIGN.md 버튼 문법 — UA 기본 링 대신 토큰 링 (.primary와 같은 규칙) */
      .clear:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 2px;
        border-radius: var(--radius-sm);
      }
      .warn {
        margin: 0;
        color: var(--color-danger);
        font-size: var(--text-caption);
      }
      .ok {
        margin: 0;
        color: var(--color-success);
        font-size: var(--text-caption);
      }
      .err {
        margin: 0;
        color: var(--color-danger);
        font-size: var(--text-caption);
      }
      .primary {
        justify-self: start;
        font: inherit;
        font-size: 1rem;
        font-weight: 400; /* Apple 버튼 문법 */
        height: 44px;
        padding: 0 var(--space-6);
        background: var(--color-primary);
        color: var(--color-primary-text);
        border: none;
        border-radius: var(--radius-pill);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .primary:active:not(:disabled) {
        transform: scale(0.95);
      }
      .primary:focus-visible {
        outline: 2px solid var(--color-primary-focus);
        outline-offset: 2px;
      }
      .primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .notice {
        margin-top: var(--space-4);
        padding: var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        text-align: center;
        color: var(--color-muted);
        font-size: var(--text-caption);
      }
      .notice a {
        color: var(--color-primary);
      }
      .error {
        color: var(--color-danger);
        padding: var(--space-6) 0;
      }

      /* --- 편집 모드 (운영진) --- */
      .edit-bar {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
      }
      .edit-form {
        display: grid;
        gap: var(--space-3);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-5);
        margin-top: var(--space-4);
      }
      .edit-form h2 {
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0;
      }
      .edit-form label {
        font-size: var(--text-caption);
        color: var(--color-muted);
        display: grid;
        gap: 4px;
      }
      /* 편집 진입 실패 메시지 — 편집 폼 밖(편집 바)에서 보여야 하므로 오른쪽 자동 밀기 */
      .edit-inline {
        margin-right: auto;
        text-align: left;
        font-size: var(--text-caption);
        color: var(--color-danger);
      }
      .edit-form input,
      .edit-form select,
      .edit-form textarea {
        height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 1rem;
        font-family: inherit;
        box-sizing: border-box;
      }
      .edit-form textarea {
        height: auto;
        min-height: 72px;
        padding: var(--space-3);
      }
      .edit-form input:focus,
      .edit-form select:focus,
      .edit-form textarea:focus {
        outline: none;
        border-color: var(--color-primary);
      }
      .edit-row {
        display: flex;
        gap: var(--space-3);
      }
      .edit-row > label {
        flex: 1;
      }
      .edit-pics {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .edit-pics .pic {
        position: relative;
        width: 72px;
        height: 72px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        border: 1px solid var(--color-border);
      }
      .edit-pics img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .edit-pics .pic button {
        position: absolute;
        top: 2px;
        right: 2px;
        background: rgba(210, 210, 215, 0.64);
        color: #1d1d1f;
        border: 0;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        cursor: pointer;
        line-height: 1;
        font-size: 0.7rem;
      }
      .edit-actions {
        display: flex;
        gap: var(--space-2);
        justify-content: space-between;
        align-items: center;
      }
      .edit-msg {
        color: var(--color-primary);
        font-size: var(--text-caption);
        min-height: 1.2em;
        margin: 0;
      }
      .edit-err {
        color: var(--color-danger);
        font-size: var(--text-caption);
        margin: 0;
      }
      .btn-ghost {
        height: 44px;
        padding: 0 var(--space-4);
        border-radius: var(--radius-pill);
        background: transparent;
        border: 1px solid var(--color-primary);
        color: var(--color-primary);
        font: inherit;
        font-size: 1rem;
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .btn-ghost:active {
        transform: scale(0.95);
      }
      .btn-danger {
        background: none;
        border: 0;
        color: var(--color-danger);
        cursor: pointer;
        font: inherit;
        font-size: var(--text-caption);
        padding: var(--space-2);
      }
    `,
  ];

  // 라우터가 주입한 itemId가 바뀔 때마다 재로드 — 목록에서 다른 물품으로 이동해도 갱신된다
  protected updated(changed: PropertyValues) {
    if (!changed.has("itemId")) return;
    if (this.itemId) void this.load();
    else this.error = "물품을 찾을 수 없어요";
  }

  async connectedCallback() {
    super.connectedCallback();
    this.user = await session.ensure();
    this.userReady = true;
  }

  // quiet: 성공 경로의 현황 갱신용 — 실패해도 화면을 에러로 갈아끊지 않고 현 데이터 유지.
  // 전체 에러 화면은 초기 로드 실패뿐 (갱신 실패는 다음 신청 때 서버가 재검증)
  private async load(quiet = false) {
    try {
      const res = await api<{ item: Item; availability: AvailabilityDay[] }>(
        `/api/items/${this.itemId}`,
      );
      this.item = res.item;
      this.availability = res.availability;
      this.editPhotos = res.item.photos;
    } catch (e) {
      if (!quiet) this.error = e instanceof Error ? e.message : "오류";
    }
  }

  private get isAdmin(): boolean {
    return this.user?.role === "admin";
  }

  // 수리중 수량을 뺀 실제로 빌려줄 수 있는 수량.
  // 배지·달력·스트립이 모두 이 값을 써야 한다 — total_qty를 쓰면 수리중 물량까지
  // 예약을 받아 실제 재고보다 많이 나가게 된다.
  private get rentableQty(): number {
    if (!this.item) return 0;
    return (
      this.item.rentable_qty ??
      this.item.total_qty - (this.item.qty_broken ?? 0)
    );
  }

  // 실물 정보 — 값이 있는 항목만 라벨/값 쌍으로 만든다 (빈 칸은 프레임만 늘리므로 제외)
  private attrPairs(): [string, string][] {
    const it = this.item;
    if (!it) return [];
    const pairs: [string, string][] = [];
    if (it.kind === "consumable") pairs.push(["구분", "소모품"]);
    if (it.location) pairs.push(["보관 위치", it.location]);
    if (it.size) pairs.push(["규격", it.size]);
    if (it.color) pairs.push(["색상", it.color]);
    if (it.note) pairs.push(["비고", it.note]);
    return pairs;
  }

  // --- 편집 모드 (운영진) ---
  private async startEdit() {
    if (!this.item) return;
    this.editMsg = "";
    // 공개 상세에는 note(내부 메모)가 없다 — 관리자 단건으로 채우지 않으면
    // undefined → ''로 저장되어 메모가 지워진다
    const res = await api<{ item: Partial<Item> }>(
      `/api/admin/items/${this.item.id}`,
    ).catch(() => null);
    if (!res) {
      this.editMsg =
        "물품 정보를 불러오지 못했어요 — 잠시 후 다시 시도해 주세요";
      return;
    }
    const it = res.item;
    this.editForm = {
      name: it.name ?? this.item.name,
      kind: it.kind ?? "rental",
      total_qty: it.total_qty ?? this.item.total_qty,
      qty_broken: it.qty_broken ?? 0,
      max_days: it.max_days ?? this.item.max_days,
      status: it.status ?? this.item.status,
      location: it.location ?? "",
      size: it.size ?? "",
      color: it.color ?? "",
      note: it.note ?? "",
      description: it.description ?? "",
    };
    this.editing = true;
  }

  private cancelEdit() {
    this.editing = false;
    this.editMsg = "";
  }

  private setEdit<K extends keyof typeof this.editForm>(
    k: K,
    v: (typeof this.editForm)[K],
  ) {
    this.editForm = { ...this.editForm, [k]: v };
  }

  private async saveEdit() {
    if (!this.item || this.editSaving) return;
    this.editSaving = true;
    this.editMsg = "";
    try {
      await api(`/api/admin/items/${this.item.id}`, {
        method: "PUT",
        body: JSON.stringify(this.editForm),
      });
      this.editing = false;
      await this.load(true); // 저장은 성공 — 갱신 실패가 화면을 덮지 않게
    } catch (e) {
      this.editMsg = e instanceof Error ? e.message : "저장 실패";
    } finally {
      this.editSaving = false;
    }
  }

  private async removeItem() {
    if (!this.item) return;
    if (!confirm(`'${this.item.name}'을(를) 삭제할까요?`)) return;
    try {
      await api(`/api/admin/items/${this.item.id}`, { method: "DELETE" });
      history.back();
    } catch (e) {
      this.editMsg = e instanceof Error ? e.message : "삭제 실패";
    }
  }

  private async uploadPhoto(e: Event) {
    if (!this.item) return;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!PHOTO_OK.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      this.editMsg = "JPEG/PNG/WebP, 5MB 이하만 가능해요";
      input.value = "";
      return;
    }
    if (this.editPhotos.length >= 3) {
      this.editMsg = "사진은 최대 3장이에요";
      input.value = "";
      return;
    }
    const fd = new FormData();
    try {
      // 업로드 전 브라우저에서 리사이즈(1600px·WebP) — 변환본만 저장 (§4.2)
      const processed = await processPhoto(file);
      fd.append("file", processed);
      await api(`/api/admin/items/${this.item.id}/photos`, {
        method: "POST",
        body: fd,
      });
      await this.load(true); // 업로드는 성공 — 갱신 실패가 화면을 덮지 않게
    } catch (err) {
      this.editMsg = err instanceof Error ? err.message : "업로드 실패";
    } finally {
      input.value = "";
    }
  }

  private async deletePhoto(p: Photo) {
    if (!this.item) return;
    try {
      await api(`/api/admin/items/${this.item.id}/photos/${p.id}`, {
        method: "DELETE",
      });
      this.editPhotos = this.editPhotos.filter((x) => x.id !== p.id);
      if (this.item) this.item = { ...this.item, photos: this.editPhotos };
    } catch (e) {
      this.editMsg = e instanceof Error ? e.message : "삭제 실패";
    }
  }

  // 로컬(브라우저) 기준 오늘 — 과거 날짜 차단의 1차 방어선 (서버는 UTC 기준 백스톱)
  private get today(): string {
    return this.fmt(new Date());
  }

  private fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }

  private get rentalDays(): number {
    if (!this.startDate || !this.endDate) return 0;
    return Math.round(
      (Date.parse(this.endDate) - Date.parse(this.startDate)) / 86400000,
    );
  }

  // 선택 기간에 실제로 빌릴 수 있는 수량 = 대여가능 − 기간 중 최대 일별 점유.
  // 일별 점유는 그날의 합계이므로 기간 전체에서 가장 붐비는 날이 상한이 된다 — 서버 가드도
  // 매 대여일마다 잔여를 보므로 어느 하루라도 넘치면 거부된다(§8). 같은 기준을 써야
  // 폼이 통과시킨 신청이 서버에서 거부되는 일이 없다.
  private get availableForRange(): number {
    if (!this.startDate || !this.endDate) return this.rentableQty;
    let max = 0;
    for (const d of this.availability) {
      // 반개구간 [start, end) — 반납일은 점유에서 제외 (§8 겹침 조건과 동일)
      if (
        d.date >= this.startDate &&
        d.date < this.endDate &&
        d.reserved > max
      ) {
        max = d.reserved;
      }
    }
    return Math.max(0, this.rentableQty - max);
  }

  // 실시간 폼 검증 — 통과 시 빈 문자열
  private get formError(): string {
    if (!this.item || !this.startDate || !this.endDate) return "";
    if (this.rentalDays < 1) {
      return "반납일은 시작일 다음 날부터 선택할 수 있어요";
    }
    if (this.rentalDays > this.item.max_days) {
      return `최대 ${this.item.max_days}일까지 대여할 수 있어요`;
    }
    if (this.startDate < this.today) return "과거 날짜는 선택할 수 없어요";
    if (!Number.isInteger(this.qty) || this.qty < 1) {
      return "수량은 1개 이상이어야 해요";
    }
    if (this.qty > this.availableForRange) {
      return this.availableForRange === 0
        ? "선택한 기간에는 남은 수량이 없어요 — 다른 기간을 선택해 주세요"
        : `선택한 기간에는 ${this.availableForRange}개까지 빌릴 수 있어요`;
    }
    return "";
  }

  // x-calendar의 change — 선택값 소유는 부모가 (controlled 컴포넌트)
  private onRange(e: Event) {
    const d = (e as CustomEvent<{ start: string; end: string }>).detail;
    this.startDate = d.start;
    this.endDate = d.end;
    this.formMsg = "";
    this.qty = 1; // 기간이 바뀌면 잔여 상한도 바뀔다 — 이전 수량을 그대로 두면 상한 초과 상태가 된다
  }

  // 선택 초기화 — '다시 선택' (탭만으로는 빈 선택 상태에 도달할 수 없어 부모가 직접 클리어)
  private clearRange() {
    this.startDate = "";
    this.endDate = "";
    this.formMsg = "";
    this.qty = 1;
    // 이 버튼은 startDate가 비면 렌더에서 빠진다 — 포커스를 달력으로 되돌리지 않으면
    // 키보드 사용자의 포커스가 body로 떨어져 Tab이 문서 처음부터 다시 시작한다
    void this.updateComplete.then(() => {
      const cal = this.renderRoot.querySelector("x-calendar") as
        (HTMLElement & { focusCursor?: () => void }) | null;
      cal?.focusCursor?.();
    });
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (
      this.saving ||
      this.formError ||
      !this.item ||
      !this.startDate ||
      !this.endDate
    ) {
      return;
    }
    this.saving = true;
    this.formMsg = "";
    try {
      await api("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          item_id: Number(this.itemId),
          start_date: this.startDate,
          end_date: this.endDate,
          qty: this.qty,
          memo: this.memo || undefined,
        }),
      });
      this.formOk = true;
      this.formMsg = "신청했어요 — 마이페이지에서 확인할 수 있어요";
      this.startDate = "";
      this.endDate = "";
      this.memo = "";
      this.qty = 1;
      await this.load(true); // 가용 현황 갱신 — 갱신 실패가 성공 메시지를 덮지 않게
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("no_availability")) {
        this.formMsg =
          "선택한 기간에 대여 가능 수량이 없어요. 다른 기간을 선택해 주세요";
        void this.load(true); // 사이에 다른 신청이 들어왔을 수 있음 — 달력·스트립 최신화
      } else if (msg.includes("too_many")) {
        this.formMsg =
          "요청한 수량이 대여 가능 수량보다 많아요 — 수량을 줄여 주세요";
      } else if (msg.includes("item_not_active")) {
        this.formMsg = "지금은 대여할 수 없는 물품이에요";
      } else if (msg.includes("not_found")) {
        this.formMsg = "삭제되었거나 찾을 수 없는 물품이에요";
      } else if (msg.includes("too_long")) {
        this.formMsg = `최대 ${this.item.max_days}일까지 대여할 수 있어요`;
      } else if (msg.includes("past_date")) {
        this.formMsg = "과거 날짜는 선택할 수 없어요";
      } else if (msg.includes("phone_required")) {
        this.formMsg =
          "연락처를 등록한 후 신청할 수 있어요 — 마이페이지에서 등록해 주세요";
      } else {
        this.formMsg = err instanceof Error ? err.message : "신청에 실패했어요";
      }
      this.formOk = false;
    } finally {
      this.saving = false;
    }
  }

  // 사진 404(R2 부재·네트워크 오류) 시 플레이스홀더로 대체
  // 메인: 📦 텍스트로 교체, 썸네일: 버튼을 비활성화해 선택지에서 제외
  private onMainImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.replaceWith(document.createTextNode("📦"));
    // 사라진 사진이 썸네일에도 있으면 해당 썸네일 비활성화
    const idx = this.photoIdx;
    const btn = this.renderRoot.querySelectorAll(".thumbs button")[idx] as
      HTMLButtonElement | undefined;
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.4";
    }
  }

  private onThumbImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    const btn = img.closest("button");
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.3";
      btn.replaceChildren(document.createTextNode("✕"));
    }
    img.remove();
  }

  render() {
    if (this.error) return html`<p class="error">${this.error}</p>`;
    if (!this.item) return html`<p class="cat">불러오는 중…</p>`;

    if (this.editing) return this.renderEdit();

    const photos = this.item.photos;
    const main = photos[this.photoIdx];
    return html`
      ${
        this.isAdmin
          ? html`
              <div class="edit-bar">
                <span class="edit-inline"
                  >${this.editing ? "" : this.editMsg}</span
                >
                <button class="btn-ghost" @click=${() => void this.startEdit()}>
                  편집
                </button>
              </div>
            `
          : ""
      }
      <div class="photo">
        ${
          main
            ? html`<img
                src=${main.url}
                alt=${this.item.name}
                @error=${this.onMainImgError}
              />`
            : "📦"
        }
      </div>
      ${
        photos.length > 1
          ? html`
              <div class="thumbs">
                ${photos.map(
                  (p, i) => html`
                    <button
                      class=${i === this.photoIdx ? "on" : ""}
                      @click=${() => (this.photoIdx = i)}
                    >
                      <img src=${p.url} alt="" @error=${this.onThumbImgError} />
                    </button>
                  `,
                )}
              </div>
            `
          : ""
      }
      <h1>
        ${this.item.name}
        ${
          this.item.availability_badge
            ? html`<x-badge kind=${this.item.availability_badge}></x-badge>`
            : ""
        }
      </h1>
      ${
        this.item.description
          ? html`<p class="desc">${this.item.description}</p>`
          : ""
      }
      <div class="spec">
        ${
          this.item.kind === "consumable"
            ? ""
            : html`<span><b>대여 가능</b>${this.rentableQty}개</span>`
        }
        ${
          this.item.qty_broken
            ? html`<span><b>수리중</b>${this.item.qty_broken}개</span>`
            : ""
        }
        <span><b>전체 보유</b>${this.item.total_qty}개</span>
        ${
          this.item.kind === "consumable"
            ? ""
            : html`<span><b>최대 대여일</b>${this.item.max_days}일</span>`
        }
      </div>
      ${
        this.attrPairs().length
          ? html`
              <dl class="attrs">
                ${this.attrPairs().map(
                  ([k, v]) => html`
                    <div>
                      <dt>${k}</dt>
                      <dd>${v}</dd>
                    </div>
                  `,
                )}
              </dl>
            `
          : ""
      }
      ${
        this.item.kind === "consumable"
          ? ""
          : html`
              <div class="strip-label">향후 90일 예약 현황</div>
              <availability-strip
                .days=${this.availability}
                .totalQty=${this.rentableQty}
              ></availability-strip>
            `
      }
      ${this.renderApply()}
    `;
  }

  // 편집 화면 — 물품 정보 수정 + 사진 관리 (삭제는 여기서, 위험 동작이라 대여 신청 폼 위에 두지 않음)
  private renderEdit() {
    const f = this.editForm;
    return html`
      <form
        class="edit-form"
        @submit=${(e: Event) => {
          e.preventDefault();
          this.saveEdit();
        }}
      >
        <h2>물품 편집</h2>
        <label
          >이름
          <input
            required
            .value=${f.name}
            @input=${(e: Event) =>
              this.setEdit("name", (e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="edit-row">
          <label
            >구분
            <select
              .value=${f.kind}
              @change=${(e: Event) =>
                this.setEdit(
                  "kind",
                  (e.target as HTMLSelectElement).value as ItemKind,
                )}
            >
              <option value="rental" ?selected=${f.kind === "rental"}>
                대여품
              </option>
              <option value="consumable" ?selected=${f.kind === "consumable"}>
                소모품
              </option>
            </select>
          </label>
        </div>
        <label
          >상태
          <select
            .value=${f.status}
            @change=${(e: Event) =>
              this.setEdit(
                "status",
                (e.target as HTMLSelectElement).value as ItemStatus,
              )}
          >
            <option value="active" ?selected=${f.status === "active"}>
              정상
            </option>
            <option value="repair" ?selected=${f.status === "repair"}>
              수리중
            </option>
            <option value="retired" ?selected=${f.status === "retired"}>
              폐기
            </option>
          </select>
        </label>
        <div class="edit-row">
          <label
            >보유 수량
            <input
              type="number"
              min="1"
              .value=${String(f.total_qty)}
              @input=${(e: Event) =>
                this.setEdit(
                  "total_qty",
                  Number((e.target as HTMLInputElement).value),
                )}
            />
          </label>
          <label
            >수리중 수량
            <input
              type="number"
              min="0"
              .value=${String(f.qty_broken)}
              @input=${(e: Event) =>
                this.setEdit(
                  "qty_broken",
                  Number((e.target as HTMLInputElement).value),
                )}
            />
          </label>
          ${
            f.kind === "consumable"
              ? ""
              : html`
                  <label
                    >최대 대여일
                    <input
                      type="number"
                      min="1"
                      max="365"
                      .value=${String(f.max_days)}
                      @input=${(e: Event) =>
                        this.setEdit(
                          "max_days",
                          Number((e.target as HTMLInputElement).value),
                        )}
                    />
                  </label>
                `
          }
        </div>
        <div class="edit-row">
          <label
            >보관 위치
            <input
              .value=${f.location}
              placeholder="예: 2층 창고 A선반"
              @input=${(e: Event) =>
                this.setEdit("location", (e.target as HTMLInputElement).value)}
            />
          </label>
          <label
            >규격
            <input
              .value=${f.size}
              placeholder="예: 20×30cm"
              @input=${(e: Event) =>
                this.setEdit("size", (e.target as HTMLInputElement).value)}
            />
          </label>
          <label
            >색상
            <input
              .value=${f.color}
              placeholder="예: 남색"
              @input=${(e: Event) =>
                this.setEdit("color", (e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <label
          >설명
          <textarea
            rows="3"
            .value=${f.description}
            @input=${(e: Event) =>
              this.setEdit(
                "description",
                (e.target as HTMLTextAreaElement).value,
              )}
          ></textarea>
        </label>
        <label
          >비고 (내부 메모)
          <textarea
            rows="2"
            .value=${f.note}
            @input=${(e: Event) =>
              this.setEdit("note", (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
        <label
          >사진 추가 (JPEG/PNG/WebP · 5MB · 최대 3장)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            @change=${this.uploadPhoto}
          />
        </label>
        <div class="edit-pics">
          ${this.editPhotos.map(
            (p) => html`
              <div class="pic">
                <img
                  src=${p.url}
                  alt=""
                  @error=${(ev: Event) =>
                    ((ev.target as HTMLImageElement).style.visibility =
                      "hidden")}
                />
                <button
                  type="button"
                  title="사진 삭제"
                  @click=${() => this.deletePhoto(p)}
                >
                  ×
                </button>
              </div>
            `,
          )}
        </div>
        <p class=${this.editMsg ? "edit-err" : "edit-msg"}>${this.editMsg}</p>
        <div class="edit-actions">
          <button type="button" class="btn-danger" @click=${this.removeItem}>
            물품 삭제
          </button>
          <span>
            <button type="button" class="btn-ghost" @click=${this.cancelEdit}>
              취소
            </button>
            <button class="primary" type="submit" ?disabled=${this.editSaving}>
              ${this.editSaving ? "저장 중…" : "저장"}
            </button>
          </span>
        </div>
      </form>
    `;
  }

  // 신청 영역 — 로그인/승인/연락처/물품 상태 분기 (§2 권한)
  private renderApply() {
    if (!this.userReady) return html`<div class="notice">&nbsp;</div>`;
    if (!this.user) {
      return html`
        <div class="notice">
          대여하려면 로그인이 필요해요 — <a href="/login">로그인하기</a>
        </div>
      `;
    }
    if (this.user.status !== "approved") {
      return html`<div class="notice">
        승인 대기 중이에요 — 관리자 승인 후 신청할 수 있어요
      </div>`;
    }
    if (!this.user.phone) {
      return html`
        <div class="notice">
          물품을 대여하려면 연락처를 등록해야 해요 —
          <a href="/signup/profile">연락처 등록하기</a>
        </div>
      `;
    }
    if (this.item!.kind === "consumable") {
      return html`
        <div class="notice">
          소모품은 대여 대상이 아니에요 — 필요한 수량은 담당자에게 문의해 주세요
        </div>
      `;
    }
    if (this.item!.status !== "active") {
      return html`<div class="notice">
        지금은 대여할 수 없는 물품이에요 (수리 중/폐기)
      </div>`;
    }
    return this.renderForm();
  }

  private renderForm() {
    const item = this.item!;
    return html`
      <form class="apply-form" @submit=${this.submit}>
        <h2>대여 신청</h2>
        <x-calendar
          .startDate=${this.startDate}
          .endDate=${this.endDate}
          .days=${this.availability}
          .totalQty=${this.rentableQty}
          .maxDays=${item.max_days}
          @change=${this.onRange}
        ></x-calendar>
        <div class="hint-row">
          <p class="hint" role="status">
            ${
              this.startDate && this.endDate
                ? `${this.rentalDays}일 대여 (반납일 제외) · 최대 ${item.max_days}일 — 날짜를 다시 눌러 바꿀 수 있어요`
                : this.startDate
                  ? "반납일을 선택해 주세요 — 하루만 빌리려면 시작일 다음 날을 고르세요"
                  : "시작일을 먼저 선택해 주세요 — 반납일은 물품을 돌려주는 날이에요"
            }
          </p>
          ${
            this.startDate
              ? html`<button
                  type="button"
                  class="clear"
                  @click=${this.clearRange}
                >
                  다시 선택
                </button>`
              : ""
          }
        </div>
        ${
          this.formError
            ? html`<p class="warn" role="alert">${this.formError}</p>`
            : ""
        }
        ${
          this.rentableQty > 1
            ? html`
                <label class="qty">
                  수량 (최대 ${this.availableForRange}개)
                  <input
                    type="number"
                    min="1"
                    max=${Math.max(1, this.availableForRange)}
                    .value=${String(this.qty)}
                    @input=${(e: Event) =>
                      (this.qty = Number((e.target as HTMLInputElement).value))}
                  />
                  <span class="qty-hint">
                    ${
                      this.startDate && this.endDate
                        ? `선택한 기간에 ${this.availableForRange}개까지 신청할 수 있어요`
                        : `이 물품은 모두 ${this.rentableQty}개까지 빌릴 수 있어요`
                    }
                  </span>
                </label>
              `
            : ""
        }
        <label class="memo">
          메모 (선택)
          <textarea
            maxlength="500"
            placeholder="사용 목적 등을 적어주세요"
            .value=${this.memo}
            @input=${(e: Event) =>
              (this.memo = (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
        <button
          class="primary"
          type="submit"
          ?disabled=${
            this.saving || !!this.formError || !this.startDate || !this.endDate
          }
        >
          ${this.saving ? "신청 중…" : "신청하기"}
        </button>
        ${
          this.formMsg
            ? html`<p class=${this.formOk ? "ok" : "err"} role="status">
                ${this.formMsg}
              </p>`
            : ""
        }
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-item-detail": PageItemDetail;
  }
}
