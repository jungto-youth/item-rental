import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../../api/client";
import { navigate } from "../../router";
import type { Dashboard, DashboardRow } from "../../types";
import { reduceMotion } from "../../styles/motion";

// SPEC §4.4 — 관리자 대시보드: 지금 나가 있는 물품과 건수.
// 기간·연체 개념이 사라져 '오늘 수령/반납 예정'과 '연체'를 계산할 수 없다.
// 대신 운영진이 실제로 챙겨야 하는 것 하나만 보여준다 — 반납되지 않은 대여 목록.
@customElement("page-admin-dashboard")
export class PageAdminDashboard extends LitElement {
  @state() private data: Dashboard | null = null;
  @state() private error = "";

  static styles = [
    reduceMotion,
    css`
      h1 {
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      .error {
        color: var(--tone-danger-text);
        font-size: var(--text-caption);
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--space-3);
        margin: var(--space-4) 0 var(--space-5);
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-4);
        text-align: left;
        font-family: inherit;
        cursor: default;
      }
      .card.link {
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .card.link:active {
        transform: scale(0.95);
      }
      .num {
        font-size: 2rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        line-height: 1.1;
      }
      .num.warn {
        color: var(--color-warning);
      }
      .label {
        margin-top: var(--space-1);
        font-size: var(--text-caption);
        color: var(--color-muted);
      }
      section {
        margin-bottom: var(--space-5);
      }
      h2 {
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: var(--tracking-tight);
        margin: 0 0 var(--space-2);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) 0;
        border-bottom: 1px solid var(--color-border);
        font-size: var(--text-caption);
      }
      .who {
        color: var(--color-muted);
      }
      .empty {
        color: var(--color-muted);
        font-size: var(--text-caption);
        margin: 0;
      }
      .trunc {
        color: var(--color-muted);
        font-size: var(--text-caption);
        margin-top: var(--space-2);
      }
      .go {
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-primary);
        font: inherit;
        font-size: var(--text-caption);
        cursor: pointer;
        white-space: nowrap;
      }
    `,
  ];

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.data = await api<Dashboard>("/api/admin/dashboard");
    } catch (e) {
      this.error = e instanceof Error ? e.message : "오류";
    }
  }

  private goStatus(status: string) {
    navigate(`/admin/reservations?status=${status}`);
  }

  render() {
    if (this.error) {
      return html`<h1>대시보드</h1>
        <p class="error">${this.error}</p>`;
    }
    if (!this.data) {
      return html`<h1>대시보드</h1>
        <p class="empty">불러오는 중…</p>`;
    }
    const d = this.data;
    return html`
      <h1>대시보드</h1>
      <div class="cards">
        <button class="card link" @click=${() => this.goStatus("rented")}>
          <div class="num ${d.rented_count > 0 ? "warn" : ""}">
            ${d.rented_count}
          </div>
          <div class="label">대여 중</div>
        </button>
        <button class="card link" @click=${() => this.goStatus("returned")}>
          <div class="num">${d.returned_count}</div>
          <div class="label">반납 완료</div>
        </button>
        <button class="card link" @click=${() => this.goStatus("cancelled")}>
          <div class="num">${d.cancelled_count}</div>
          <div class="label">취소</div>
        </button>
      </div>

      ${this.renderRented(d.rented, d.rented_truncated)}
    `;
  }

  // 수량은 반납 시 실제로 챙길 개수라 목록에서 바로 보여야 한다.
  // 1개짜리에 '1개'를 붙이면 모든 행이 길어지고 정보가 없다 — 2개 이상만 표시
  private itemLabel(r: DashboardRow) {
    return r.qty > 1 ? `${r.item_name} · ${r.qty}개` : r.item_name;
  }

  private renderRented(rows: DashboardRow[], truncated = false) {
    return html`
      <section>
        <h2>대여 중</h2>
        ${
          rows.length === 0
            ? html`<p class="empty">없어요</p>`
            : html`
                <ul>
                  ${rows.map(
                    (r) =>
                      html`<li>
                        <span>${this.itemLabel(r)}</span>
                        <span class="who"
                          >${r.member_phone
                            ? `${r.member_name} · ${r.member_phone}`
                            : r.member_name}</span
                        >
                      </li>`,
                  )}
                </ul>
              `
        }
        ${truncated ? html`<p class="trunc">상위 50건까지만 표시 — 나머지는 대여 관리에서 확인</p>` : ""}
        ${rows.length > 0
          ? html`<p class="trunc">
              <button class="go" @click=${() => this.goStatus("rented")}>
                대여 관리에서 반납 처리하기 →
              </button>
            </p>`
          : ""}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-admin-dashboard": PageAdminDashboard;
  }
}
