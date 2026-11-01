# Tailwind CSS

Tailwind는 **선택 사항**이다. 기존 `static styles`(Lit `css`)를 없애는 전환이 아니라,
새 컴포넌트·수정하는 컴포넌트에서 레이아웃·색을 짧게 쓰기 위한 두 번째 도구다.
값의 단일 출처는 여전히 [`tokens.css`](../../web/src/styles/tokens.css) 다.

## 1. Shadow DOM 문제와 해법

전역 스타일시트는 shadow root 안으로 침투하지 않는다. 그래서 `<link>`로 Tailwind를
불러와도 `<div class="flex gap-2">`는 아무 효과가 없다.

해법은 **컴파일된 CSS를 문자열로 받아 shadow root마다 채택하는 것**이다.

```
web/src/styles/tailwind.css   ← Tailwind 진입점 (스캔 범위·@theme 매핑)
web/src/styles/tw.ts          ← ?inline으로 읽어 CSSResult 하나로 공유
```

```ts
import { tw } from "../../styles/tw";

static styles = [tw, css`...`];
```

- 모듈 스코프의 `CSSResult` 하나를 모든 컴포넌트가 공유하므로, 32개 컴포넌트가
  채택해도 브라우저는 `CSSStyleSheet`를 한 번만 만든다.
- 테마 변수는 Tailwind가 `:root, :host` 양쪽에 내보낸다. 즉 shadow root 안에서도
  `--spacing`·`--text-sm` 같은 테마 값이 살아 있다.
- 색·그림자는 `@theme inline`으로 **tokens.css 변수를 그대로 참조**한다
  (`bg-primary` → `background-color: var(--primary)`). 그래서 토큰을 고치면
  유틸리티도 따라 바뀌고, 값이 두 곳에 생기지 않는다.

`web/src/styles/tailwind.css`를 화면에 직접 `<link>` 하지 않는다. 같은 CSS가
전역과 shadow root에 두 번 들어간다.

## 2. 매핑

| 유틸리티 | 토큰 | 값 |
| --- | --- | --- |
| `bg-canvas` | `--bg` | `#f6f7f9` |
| `bg-surface` / `bg-surface-muted` | `--surface` / `--surface-muted` | |
| `text-ink-1` / `-2` / `-3` | `--ink-1` / `-2` / `-3` | |
| `border-line` / `border-line-strong` | `--border` / `--border-strong` | |
| `bg-primary` / `text-primary` / `border-primary` | `--primary` | `#ea580c` |
| `…-primary-strong` / `…-primary-soft` | `--primary-strong` / `--primary-soft` | |
| `…-warning` / `…-warning-soft` | `--warning` / `--warning-soft` | |
| `…-danger` / `…-danger-soft` | `--danger` / `--danger-soft` | |
| `rounded-control` | `--radius` | `8px` |
| `rounded-full` | `--radius-pill` | 알약 |
| `shadow-drop` / `shadow-overlay` | `--shadow-menu` / `--shadow-modal` | |
| `font-sans` | `--font-body` | Noto Sans KR |

매핑하지 않은 스케일은 Tailwind 기본값이 이미 토큰과 맞는다.

- 간격: `gap-2`=8 · `gap-4`=16 · `gap-6`=24 · `gap-8`=32 · `gap-10`=40
  (= `--space-1`…`--space-5`)
- 글자: `text-sm`=14 · `text-base`=16 · `text-xl`=20 · `text-2xl`=24
  (= `--text-fine`·`--text-body`·`--text-heading`·`--text-page-title`)
- 라운드: `rounded-lg`=8px

`--tracking-tight` 하나만 이름이 겹친다. Tailwind 기본값(-0.025em)이 shadow root의
`:host`에서 토큰(-0.015em)을 가리므로 `@theme`에서 같은 값으로 고정해 두었다.
**tokens.css의 tracking 값을 바꾸면 `tailwind.css`의 고정값도 같이 바꾼다.**

## 3. 쓰는 곳 / 안 쓰는 곳

| 상황 | 선택 |
| --- | --- |
| 새 컴포넌트, 또는 손대는 컴포넌트 | 유틸리티 + `:host`만 `css` |
| 여러 페이지가 공유하는 규격(`ui.ts`의 `cardCss` 등) | `ui.ts` 그대로 — 한 곳에서 고치는 편이 낫다 |
| `:host`, `::part`, `:host([compact])` 같은 shadow 전용 선택자 | `css` |
| 상태별 조합이 3개 이상인 스타일 | `css` 클래스가 읽기 쉽다 |

전환은 **한 컴포넌트씩** 한다.

```bash
npm run check && npm run test:visual
```

시각 회귀가 통과하면 픽셀이 그대로라는 뜻이다(현재 `x-badge`가 전환된 상태로 통과).
바뀌었다면 의도한 변경인지 먼저 확인하고, 맞을 때만 `npm run test:visual:update`.

## 4. 주의

- **클래스는 소스에 통째로 적는다.** Tailwind는 파일 텍스트를 스캔한다.
  `` class=`bg-${kind}` `` 처럼 조립하면 생성되지 않는다. 조건은 삼항으로 전체
  문자열을 고른다(`badge.ts` 참고).
- **Preflight가 shadow root 안에서 돈다.** `*`의 margin·padding·border가 0이 되고
  `:host`에 서체·행간이 깔린다. 대부분 기존 `css`와 같은 값이라 무해하지만,
  UA 기본값에 기대던 컴포넌트를 전환할 때는 스냅샷으로 확인한다.
- **`tw`는 `static styles` 배열 맨 앞**에 둔다. 유틸리티는 `@layer utilities`라
  레이어 없는 컴포넌트 `css`에 항상 지므로, 전환 중에는 기존 `css`가 이긴다.
- 스캔 범위는 `web/src/**/*.ts`로 제한했다(`source(none)`). `server/`·`design/`의
  클래스 이름이 번들에 섞이지 않는다.
- 번들: 쓰인 유틸리티만 들어간다. 현재 preflight 포함 약 10KB(비압축)이며,
  `tw`를 import한 청크에 한 번만 실린다.
