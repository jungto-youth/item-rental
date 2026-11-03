# DESIGN.md

이 프로젝트의 UI 기준. **값의 단일 출처는 `web/src/styles/tokens.css`**이고, 이 문서는 그 값을
어떻게 쓰는지에 대한 요약이다. Lit 원본(`web-lit/src/styles/tokens.css`)도 같은 값을 쓴다.
값과 문서가 어긋나면 코드가 맞다.

- 대상: 배포하는 SolidJS SPA (`web/`)와 Lit 원본 (`web-lit/`)
- 룩: 중립 회색 바탕 · 흰 카드 · 오렌지 포인트 · 8px 간격
- 시안: `design/` (리뷰용 HTML). 운영 방식은 `design/README.md` 참고

## 1. 원칙

1. **조용함** — 장식보다 정보. 장식용 그림자·그라데이션·큰 색면을 쓰지 않는다.
2. **빠른 스캔** — 사진 → 이름 → 위치 → 대여 가능 수량 순서로 읽힌다.
3. **명확한 행동** — 화면마다 주 액션은 하나. 빈 상태·오류는 항상 다음 행동을 말한다.

미니멀은 필요한 신호까지 지우는 것이 아니다. 과업에 불필요한 노이즈만 줄이고
상태·조작 가능성·오류·포커스는 남긴다.

## 2. 토큰

### 색 (15)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--ink-1` / `--ink-2` / `--ink-3` | `#111827` / `#4b5563` / `#9ca3af` | 본문 / 보조 / 비활성 |
| `--bg` / `--surface` / `--surface-muted` | `#f6f7f9` / `#ffffff` / `#f3f4f6` | 바탕 / 카드 / 사진 자리·호버 |
| `--border` / `--border-strong` | `#e5e7eb` / `#d1d5db` | 헤어라인 / 입력 경계 |
| `--primary` / `--primary-strong` / `--primary-deep` / `--primary-soft` | `#ea580c` / `#c2410c` / `#9a3412` / `#fff1e8` | 액션·선택 |
| `--warning` / `--warning-soft` | `#b45309` / `#fffbeb` | 수리 중 |
| `--danger` / `--danger-soft` | `#dc2626` / `#fef2f2` | 오류·삭제 |

- 새 색은 토큰에 먼저 추가한다. 컴포넌트에 hex를 직접 쓰지 않는다.
- 대비: 텍스트 4.5:1, UI 경계·포커스 3:1 이상.
- `primary`는 주 액션·선택에만, `danger`는 오류·파괴적 행동에만.

### 글자

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--text-fine` | 14px | 캡션·배지·라벨 |
| `--text-body` | 16px | 본문·버튼·인풋·칩 |
| `--text-heading` | 20px | 섹션 제목 |
| `--text-page-title` | 24px | 페이지 제목 |

14px 미만은 쓰지 않는다. 제목 700, 카드·버튼 제목 600, 본문 400이 기본.

### 간격·라운드·레이아웃

| 토큰 | 값 |
| --- | --- |
| `--space-1` … `--space-5` | 8 / 16 / 24 / 32 / 40px |
| `--radius` / `--radius-pill` | 8px / 999px |
| `--line-height` / `--line-height-button` | 1.5 / 1.2 |
| `--layout-max` | 1280px — 헤더·본문·푸터 공통 |
| `--layout-form` | 720px — 폼·계정 카드 |
| `--layout-onboarding` | 400px — 로그인·프로필 등록 |
| `--layout-doc` | 1280px — 정책 문서 |

- 8px 단위 밖의 margin·padding·gap을 만들지 않는다(12·20px 금지).
- 그림자는 **떠 있는 층**(메뉴·모달·FAB)에만. 카드·인풋은 1px 테두리로 구분한다.

## 3. 레이아웃

### 앱 셸

헤더 → 본문 → 푸터. 본문 최대 폭은 `--layout-max`.
**로그인·프로필 등록만** 헤더·푸터가 없는 전체 화면이다(`app-shell`의 `isPlain`).
푸터는 로그인 외 모든 화면에 있고, 404는 흰 면(`surface`), 나머지는 캔버스 바탕.

### 2열 셸 (`pageSplitCss`)

목록·계정·관리 화면은 **왼쪽 주 컨텐츠 + 오른쪽 320px 보조 패널**이다.

```
.split   grid: minmax(0,1fr)                 → 1024px 이상: minmax(0,1fr) 320px
.main    min-width: 0
.side    flex column, 1024px 이상 sticky top 96px
.side-hide  보조 설명을 1024px 미만에서 숨긴다
```

- 보조 패널 카드는 `sideCardCss`(`.side-card`) — 제목 + 설명 + 선택적 링크.
- 관리자 화면은 `admin-page`의 `side` 속성과 `slot="side"`로 같은 셸을 쓴다.
- 홈은 예외다. 검색이 왼쪽 위, 보조 패널이 오른쪽, 필터·그리드가 아래
  (`grid-template-areas: "search side" / "main side"`). 1024px 미만에서 패널을 숨기고
  등록은 FAB가 맡는다.
- 정책은 본문 680px + 오른쪽 320px 목차(`order`로 뒤집음).

## 4. 컴포넌트 계약

컴포넌트는 모양이 아니라 **계약**이다. 같은 이름이 화면마다 다르게 생기면 시스템이 아니다.

| 컴포넌트 | 변형 | 반드시 정의할 상태 |
| --- | --- | --- |
| 버튼 | primary / secondary / danger | hover, focus-visible, disabled, loading |
| 인풋 | text / textarea / number | focus, disabled, required, error |
| 칩 | sm / lg | active(`aria-pressed`), disabled, focus-visible |
| 배지 | 상태 텍스트 | — (읽기 전용) |
| 모달 | 기본 | open, Esc, 포커스 트랩, 스크롤 잠금 |
| 공지 | info / danger | action 유무 |
| 빈 상태 | loading / empty / error | action 유무 |
| 물품 카드 | 사진 유무 | hover, focus-visible |
| 행 목록 | 일반 / 강조 | 마지막 행, 모바일 줄바꿈 |
| 사진 업로더 | 0–3장 | 업로드 중, 오류, 삭제 |
| 페이지 헤더 | 제목·부제·액션 | — |
| 접이식 섹션 (`details`) | 펼침/접힘 | focus-visible, 화살표 회전 |

핵심 규격:

- **버튼** 약 37px, 16px/600. primary는 `--primary` 채움(hover `--primary-strong`),
  secondary는 흰 바탕 + `--border`, danger는 `--danger` 테두리·글자.
- **인풋** 40px, label 14px + 8px + 컨트롤. focus는 `--primary` 테두리,
  오류는 `--danger` 테두리 + 메시지, textarea 최소 72px.
- **칩** 약 37px(개수는 14px), `lg`는 44px. 알약. active는 `--ink-1` 채움 + 흰 글자 + 600.
- **배지** 14px 알약 + 점 6px. 상태는 텍스트가 말한다 — 색만으로 구분하지 않는다.
- **물품 카드** 사진 4:3, 본문 16px, hover는 테두리만(`--border-strong`). 확대 효과 없음.
- **모달** `--shadow-modal`, 오버레이, Esc 닫기, 열었던 요소로 포커스 복귀.

모든 인터랙티브 요소는 default / hover / focus-visible(2px `--primary`) / active /
disabled / loading / error / empty / mobile 390을 확인한다.
터치 타깃은 최소 24×24px, 주요 컨트롤은 32–40px.

## 5. 스타일 작성

| 형태 | 언제 | 예 |
| --- | --- | --- |
| `component.css` + `sheet()` | 기본 — 새로 쓰거나 손대는 컴포넌트 | `components/ui/chip.css` |
| `css\`\`` 템플릿 | 3~5줄짜리 작은 규칙 | `pages/not-found.ts` |
| `styles/ui.ts` 조각 | 두 화면 이상이 공유하는 규격 | `pageSplitCss`, `sideCardCss`, `cardCss`, `formCss` |

- `base`(`styles/base.css`)를 항상 첫 번째에 둔다. shadow root마다 전역 리셋을 복원한다.
- margin·padding 리셋을 컴포넌트에 넣지 않는다 — UA 기본 여백에 기대는 화면이 조용히 틀어진다.
- **앱에서 Tailwind·유틸리티 클래스는 쓰지 않는다.** (`design/` 시안만 Tailwind CDN을 쓴다.)
- 같은 규격이 2곳 이상에서 반복되면 `ui.ts`로 올린다.

## 6. 하지 말 것

- 컴포넌트 안의 임의 hex, 8px 단위 밖 간격, 4단계 밖 글자 크기
- `8 / 999` 밖의 라운드, 카드·인풋의 그림자·그라데이션, transform 확대
- 색만으로 상태 구분
- 텍스트 버튼을 라벨처럼, 인풋을 정적 텍스트처럼 보이게 두기
- 화면마다 버튼 높이·패딩을 새로 만들기
- 시안의 고정 숫자(예: "대여 2건")를 앱에 그대로 옮기기 — 실제 데이터로 바꾸거나 문구로 푼다

## 7. 검증

```bash
npm run check              # tsc(web·server·tests·scripts·design) + 시안 마커 최신 확인
npm test                   # 단위·통합 (DB 불필요)
npm run test:visual        # 390/768/1280 시각 회귀
npm run test:visual:update # 의도한 변경이면 기준선 갱신
npm run build && npm run check:production
```

- 기준선은 `web-lit/tests/visual/baseline/`, 실패 시 현재 화면은 `current/`(gitignore).
- `test:visual`은 Vite를 띄우고 API를 고정 fixture로 대체해 D1·R2·로그인 없이 돈다.
- 기준선은 **같은 브라우저/OS에서만** 일치한다. 다른 환경에서 갱신하면 전부 어긋난다.
- 접근성 기준은 WCAG 2.2 AA. axe 자동 검사는 아직 도입하지 않았다.

### 남은 것

- [ ] 시각 회귀를 CI에 넣기 (CI는 `check`·`test`·`build`만 돈다)
- [ ] 1024px 경계 기준선 (레이아웃이 갈라지는 지점인데 390/768/1280만 캡처)
- [ ] axe critical 0
- [ ] 5명 사용성 테스트
- [ ] 상세 사진 없음 화면의 밀도, 관리자 회원 행의 모바일 액션 정렬

## 8. 시안(`design/`)

`design/`은 배포 대상이 아니라 리뷰용 HTML이다. 빌드 없이 `file://`로 열린다.

- 공통 조각은 `design/partials/`에 한 벌만 두고, 각 페이지의 마커 사이에 채운다.
- `node design/build.ts`로 채우고, `--check`로 드리프트를 감지한다(`npm run check`에 포함).
- CSS는 여러 화면이 같이 쓰는 규칙만 `design/assets/components.css`로 올린다.
- 상세한 마커 문법은 `design/README.md`.
- 같은 시안의 SolidJS 구현은 `solid/`에 있다(Tailwind v4, 샘플 데이터). 실행·화면·연결 방법은 `solid/README.md`.

## 참고

- [NN/g — Design Systems 101](https://www.nngroup.com/articles/design-systems-101/)
- [NN/g — Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/)
- [Martin Fowler — Design Token-Based UI Architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- 참고 시스템: Web Awesome(Lit), Nord, GOV.UK, Open Props
