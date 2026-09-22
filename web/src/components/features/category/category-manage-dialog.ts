import { getCategories, invalidateCategories } from "../../../utils/categories";
import { LitElement, html, css } from "lit";
import { confirmDialog } from "../../../utils/confirm";
import { customElement, property, state } from "lit/decorators.js";
import { api } from "../../../api/client";
import type { Category } from "../../../types";
import "../../ui/modal";
import "../../ui/button";
import "../../ui/empty";

// 카테고리 관리 — 추가·이름변경·삭제를 작은 모달에서.
// 물품 연결은 id 기준이라 이름변경은 해당 카테고리 물품 전체에 반영되고,
// 삭제된 카테고리의 물품은 '미지정'이 된다(FK ON DELETE SET NULL — 0020).
@customElement("category-manage-dialog")
export class CategoryManageDialog extends LitElement {
  @property({ type: Boolean }) open = false;

  @state() private categories: Category[] = [];
  @state() private loading = true;
  @state() private busy = false;
  @state() private error = "";
  @state() private newName = "";
  @state() private editingId: number | null = null;
  @state() private editingName = "";

  async willUpdate(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open) void this.reload();
  }

  private async reload() {
    try {
      this.categories = await getCategories();
      this.error = "";
    } catch {
      this.error = "카테고리를 불러오지 못했어요";
    } finally {
      this.loading = false;
    }
  }

  private notifyChanged() {
    this.dispatchEvent(new CustomEvent("changed", { bubbles: true, composed: true }));
  }

  private handleClose = () => {
    this.editingId = null;
    this.error = "";
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };

  private async handleAdd() {
    const name = this.newName.trim();
    if (!name || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      this.newName = "";
      invalidateCategories();
      await this.reload();
      this.notifyChanged();
    } catch {
      this.error = "추가에 실패했어요 — 이미 있는 이름인지 확인해 주세요";
    } finally {
      this.busy = false;
    }
  }

  private async handleRename(id: number) {
    const name = this.editingName.trim();
    if (!name || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await api(`/api/admin/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      this.editingId = null;
      invalidateCategories();
      await this.reload();
      this.notifyChanged();
    } catch {
      this.error = "이름 변경에 실패했어요 — 이미 있는 이름인지 확인해 주세요";
    } finally {
      this.busy = false;
    }
  }

  private async handleDelete(c: Category) {
    if (this.busy) return;
    const extra =
      c.item_count > 0
        ? `\n연결된 물품 ${c.item_count}개는 '미지정'이 됩니다.`
        : "";
    if (!(await confirmDialog(`'${c.name}' 카테고리를 삭제할까요?${extra}`, { confirmLabel: "삭제" }))) return;
    this.busy = true;
    this.error = "";
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      invalidateCategories();
      await this.reload();
      this.notifyChanged();
    } catch {
      this.error = "삭제에 실패했어요";
    } finally {
      this.busy = false;
    }
  }

  static styles = css`
    :host {
      display: contents;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface);
      overflow: hidden;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border-bottom: 1px solid var(--color-border);
    }
    li:last-child {
      border-bottom: 0;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      font-size: var(--text-body, 15px);
    }
    .count {
      color: var(--color-muted);
      font-size: var(--text-caption, 13px);
      flex-shrink: 0;
    }
    input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-bg);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--text-body, 15px);
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: var(--color-primary);
    }
    .error-msg {
      color: var(--color-danger);
      font-size: var(--text-caption, 13px);
      margin: 0 0 var(--space-2, 8px);
    }
    .add-row {
      display: flex;
      gap: var(--space-2, 8px);
      margin-top: var(--space-3, 12px);
    }
  `;

  render() {
    return html`
      <x-modal ?open=${this.open} title="카테고리 관리" maxWidth="480px" @close=${this.handleClose}>
        ${this.error ? html`<p class="error-msg">${this.error}</p>` : ""}
        ${this.loading
          ? html`<x-empty state="loading"></x-empty>`
          : this.categories.length === 0
            ? html`<x-empty text="아직 카테고리가 없어요 — 아래에서 추가하세요"></x-empty>`
            : html`
                <ul>
                  ${this.categories.map((c) =>
                    this.editingId === c.id
                      ? html`
                          <li>
                            <input
                              .value=${this.editingName}
                              @input=${(e: Event) =>
                                (this.editingName = (e.target as HTMLInputElement).value)}
                              @keydown=${(e: KeyboardEvent) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void this.handleRename(c.id);
                                }
                              }}
                            />
                            <x-button variant="primary" size="sm" @click=${() => this.handleRename(c.id)}>
                              저장
                            </x-button>
                            <x-button variant="secondary" size="sm" @click=${() => (this.editingId = null)}>
                              취소
                            </x-button>
                          </li>
                        `
                      : html`
                          <li>
                            <span class="name">${c.name}</span>
                            <span class="count">${c.item_count}개</span>
                            <x-button
                              variant="secondary"
                              size="sm"
                              @click=${() => {
                                this.editingId = c.id;
                                this.editingName = c.name;
                              }}
                            >
                              이름변경
                            </x-button>
                            <x-button variant="danger" size="sm" @click=${() => this.handleDelete(c)}>
                              삭제
                            </x-button>
                          </li>
                        `,
                  )}
                </ul>
              `}
        <div class="add-row">
          <input
            placeholder="새 카테고리 이름"
            .value=${this.newName}
            @input=${(e: Event) => (this.newName = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void this.handleAdd();
              }
            }}
          />
          <x-button variant="primary" size="sm" @click=${this.handleAdd} ?loading=${this.busy}>
            추가
          </x-button>
        </div>
      </x-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "category-manage-dialog": CategoryManageDialog;
  }
}