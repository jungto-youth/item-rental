# 11 — UI 컴포넌트

컴포넌트별 변형과 상태, 핵심 규격, Tailwind 기반 스타일 작성 규칙.

## 컴포넌트 계약

컴포넌트는 모양이 아니라 **계약**이다. 같은 이름이 화면마다 다르게 생기면 시스템이 아니다.

| 컴포넌트 | 변형 | 반드시 정의할 상태 |
| --- | --- | --- |
| 버튼 | primary / secondary / danger | hover, focus-visible, disabled, loading |
| 텍스트 버튼 | 링크 / 동작 | hover, focus-visible, disabled, loading |
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
- **텍스트 버튼** 36px, 16px/500. 테두리·배경 없이 `--ink-2` 글자만 두고,
  hover는 배경 없이 `--ink-1`로 글자색만 바뀐다. 아이콘은 16px, 글자와 8px 간격.
  '목록으로' 같은 보조 내비게이션에 쓴다. 목록을 더 불러오는 동작은 '더보기' 버튼
  대신 스크롤 감지(무한 스크롤)로 처리하고, 불러오는 동안만 상태 줄을 보여준다.
- **인풋** 40px, label 14px + 8px + 컨트롤. focus는 `--primary` 테두리,
  오류는 `--danger` 테두리 + 메시지, textarea 최소 72px.
- **칩** 약 37px(개수는 14px), `lg`는 44px. 알약. active는 `--ink-1` 채움 + 흰 글자 + 600.
- **배지** 14px 알약 + 점 6px. 상태는 텍스트가 말한다 — 색만으로 구분하지 않는다.
- **물품 카드** 사진 4:3, 본문 16px, hover는 테두리만(`--border-strong`). 확대 효과 없음.
- **모달** `--shadow-modal`, 오버레이, Esc 닫기, 열었던 요소로 포커스 복귀.
- **브랜드 로고** `BrandLogo` — `web/public/logo.svg` 하나를 `--primary-soft` 원형 칩에 넣는다.
  칩과 로고의 크기 차이는 4px로 고정하고, 헤더는 `sm`(32/24px), 로그인은
  `lg`(48/40px, 600px 이상 56/48px)을 쓴다. 파비콘·터치 아이콘도 같은 SVG에서 파생한다.

모든 인터랙티브 요소는 default / hover / focus-visible(2px `--primary`) / active /
disabled / loading / error / empty / mobile 390을 확인한다.
터치 타깃은 최소 24×24px, 주요 컨트롤은 32–40px.

## 스타일 작성

- **`web/`은 Tailwind v4 유틸리티 클래스만 쓴다.** 값은 `tokens.css`의 CSS 변수를
  `tailwind.css`의 `@theme inline`으로 노출한 토큰 유틸리티(`bg-surface`, `text-ink-2`,
  `rounded-card`)로만 참조한다. 임의 hex·중간 px 값은 만들지 않는다.
- 같은 규격이 2곳 이상에서 반복되면 `components/ui/`의 컴포넌트로 올린다
  (`Button`, `TextButton`, `Badge`, `Chip`, `Empty`, `Input`, `Modal`, `Notice`, `PageHeader`, `InfoList`).
