# 디자인 토큰

토큰은 “이 색을 어디에 왜 쓰는가”를 값으로 고정한 것이다.
이 프로젝트의 단일 출처는 [`web/src/styles/tokens.css`](../../web/src/styles/tokens.css) 다.

## 1. 3층 구조

| 층 | 역할 | 이 프로젝트 |
| --- | --- | --- |
| Option / Primitive | 선택 가능한 원시 값 | CSS 변수로 직접 노출하지 않음 |
| Decision / Semantic | 어떻게 적용할지 | `--ink-1`, `--surface`, `--space-2`, `--text-fine` |
| Component | 어디에 적용할지 | `--button-bg`, `--input-border` (도입 후보) |

작은 프로젝트에서는 2층(semantic)만으로 충분하다.
컴포넌트가 늘어나 같은 결정을 반복할 때 component 토큰을 추가한다.

> 참고: [Martin Fowler — Design Token-Based UI Architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html)

## 2. 현재 토큰

### 색

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--ink-1` | `#111827` | 본문·제목 |
| `--ink-2` | `#4b5563` | 보조 설명·라벨 |
| `--ink-3` | `#9ca3af` | 비활성·아이콘 |
| `--bg` | `#f6f7f9` | 중립 회색 바탕 |
| `--surface` | `#ffffff` | 카드·필드 |
| `--surface-muted` | `#f3f4f6` | 사진 자리·호버 |
| `--border` | `#e5e7eb` | 1px 헤어라인 |
| `--border-strong` | `#d1d5db` | 입력·구분 강조 |
| `--primary` | `#ea580c` | 주 액션·선택 |
| `--primary-strong` | `#c2410c` | hover·눌림·링크 |
| `--primary-soft` | `#fff1e8` | 배지·태그 면 |
| `--warning` | `#b45309` | 수리 중 |
| `--warning-soft` | `#fffbeb` | 수리 중 배지 면 |
| `--danger` | `#dc2626` | 오류·삭제 |
| `--danger-soft` | `#fef2f2` | 오류 배너 면 |

규칙:

- 새 색은 먼저 토큰에 추가한다. 컴포넌트에 hex를 직접 쓰지 않는다.
- 텍스트 대비는 4.5:1, UI 경계·포커스는 3:1 이상을 목표로 한다.
- `primary`는 주 액션·선택에만 쓴다. 상태 색으로 남용하지 않는다.
- `danger`는 오류·파괴적 행동에만 쓴다.

### 글자

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--text-fine` | `0.875rem` (14px) | 캡션·배지·라벨·보조 정보 |
| `--text-body` | `1rem` (16px) | 본문·버튼·인풋·칩 |
| `--text-heading` | `1.25rem` (20px) | 섹션 제목 |
| `--text-page-title` | `1.5rem` (24px) | 페이지 제목 |

규칙:

- 4단계 밖의 크기를 만들지 않는다.
- 14px 미만은 쓰지 않는다. (모바일 가독성)
- 페이지 제목은 700, 카드·버튼 제목은 600, 본문은 400을 기본으로 한다.

### 간격

| 토큰 | 값 |
| --- | --- |
| `--space-1` | 8px |
| `--space-2` | 16px |
| `--space-3` | 24px |
| `--space-4` | 32px |
| `--space-5` | 40px |

규칙:

- 모든 margin·padding·gap은 8px 단위만 쓴다.
- 컨트롤은 위아래 8px, 좌우 16px 패딩을 기본으로 한다.
- 컴포넌트 사이 16px, 섹션 사이 24–32px.
- 임의의 중간값(12px, 20px 등)을 만들지 않는다.

### 레이아웃

| 토큰 | 값 | 용도 |
| --- | --- | --- | --- |
| `--layout-max` | `1200px` | 헤더·본문 공통 최대 폭 |

관리자 폼도 같은 최대 폭 안에서 전체 폭을 쓴다.

### 라운드·행간·깊이

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--radius` | `8px` | 버튼·인풋·셀렉트·카드·모달·행 |
| `--radius-pill` | `999px` | 칩·배지·아바타 |
| `--line-height` | `1.5` | 본문 |
| `--line-height-button` | `1.2` | 버튼·인풋·셀렉트 |
| `--shadow-menu` | `0 8px 24px rgba(23,23,23,.1)` | 드롭다운 메뉴 |
| `--shadow-modal` | `0 24px 64px rgba(23,23,23,.18)` | 모달 |

그림자는 **떠 있는 층**(메뉴·모달·모바일 FAB)에만 쓴다. 카드·인풋에는 쓰지 않는다.

### 서체

`Noto Sans KR` 하나만 쓴다. `--font-body`로 참조한다.

## 3. 아직 토큰화하지 않은 값

| 값 | 현재 위치 | 후보 토큰 |
| --- | --- | --- |
| 포커스 링 `2px` | 여러 컴포넌트 | `--focus-ring-width` |
| z-index `10/20/21/100` | header·menu·fab·modal | `--z-header` 등 |
| 모션 `0.15s` | hover·fade | `--motion-fast` |
| 오버레이 `rgba(0,0,0,.45)` | modal | `--overlay` |

## 4. 토큰 변경 절차

1. **이유 기록** — 어떤 화면의 어떤 문제를 해결하는가
2. **대비 확인** — 텍스트 4.5:1, UI 3:1
3. **`tokens.css`만 수정** — 컴포넌트에 예외 값을 만들지 않는다
4. **raw 값 검사** — `hex`, `rgba`, 8px 단위 밖의 spacing이 남아 있는지 확인
5. **3 뷰포트 캡처** — 390 / 768 / 1280
6. **문서 갱신** — 이 파일의 표와 관련 컴포넌트 문서
7. **리뷰** — 토큰 변경은 시각 회귀 리뷰와 함께

## 5. 금지 목록

- 컴포넌트 안의 임의 hex
- 8px 단위가 아닌 margin·padding·gap
- 14/16/20/24 밖의 글자 크기
- `8 / 999` 밖의 border-radius
- 카드·인풋에 box-shadow·gradient
- transform 확대 효과
- 상태를 색만으로 구분하기 (색+텍스트/굵기/점 병행)
