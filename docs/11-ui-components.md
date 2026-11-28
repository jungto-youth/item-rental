# 11 — UI 컴포넌트

컴포넌트별 변형과 상태, 핵심 규격, Tailwind 기반 스타일 작성 규칙.

## 컴포넌트 계약

컴포넌트는 모양이 아니라 **계약**이다. 같은 이름이 화면마다 다르게 생기면 시스템이 아니다.

| 컴포넌트 | 변형 | 반드시 정의할 상태 |
| --- | --- | --- |
| 버튼 | primary / secondary / danger | hover, focus-visible, disabled, loading |
| 텍스트 버튼 | 링크 / 동작 | hover, focus-visible, disabled, loading |
| 인풋 | text / textarea / number | focus, disabled, required, error |
| 검색 필드 (`SearchField`) | 관리자 목록 검색 | 입력, 지우기, Esc, focus-visible |
| 칩 | 단일 | active(`aria-pressed`), disabled, focus-visible |
| 대여 기간 선택 (`RentalPeriodPicker`) | 빠른 선택 칩 + 날짜 입력 | 칩 active, 직접 입력, 범위(내일~30일) |
| 배지 | 상태 텍스트 | — (읽기 전용) |
| 태그 | 분류 · 대표 | — (읽기 전용) |
| 모달 | 기본 | open, Esc, 포커스 트랩, 스크롤 잠금 |
| 공지 | info / danger | action 유무 |
| 빈 상태 | loading / empty / error | action 유무 |
| 물품 카드 | 사진 유무 · 담기 가능/담김/상한 | hover, focus-visible, disabled |
| 수량 스테퍼 | 조절 / 최대 1개 고정 | 감소·증가 disabled, 직접 입력 오류 보정 |
| 장바구니 하단 바 | 담긴 종류 있음/없음 | focus-visible, 모바일 안전 영역 |
| 장바구니 줄 | 정상 / 신청 불가 / 항목별 실패 | 수량 조절, 빼기, focus-visible |
| 행 목록 | 일반 / 강조 | 마지막 행, 모바일 줄바꿈 |
| 사진 업로더 | 0–3장 | 업로드 중, 오류, 삭제 |
| 페이지 헤더 | 제목·부제·액션 | — |
| 문서 셸 (`DocPage`) | 선택적 탭 → 제목 → 2열 | active 탭(`aria-current`), focus-visible |
| 문서 본문 (`DocArticle`) | h2 / p / ul / table | — |
| 문서 목차 (`DocToc`) | 데스크톱 오른쪽 레일 / 모바일 숨김 | active(`aria-current`), focus-visible |
| 접이식 섹션 (`details`) | 펼침/접힘 | focus-visible, 화살표 회전 |

문서 목차는 본문의 `h2[id][data-toc]`를 자동으로 모은다. 새 섹션은 제목에 `id`와
`data-toc`만 붙이면 목차에 바로 반영된다.

핵심 규격:

- **버튼** 40px, 14px/600, 좌우 12px. primary는 `--primary` 채움(hover `--primary-strong`),
  secondary는 흰 바탕 + `--border`, danger는 `--danger` 테두리·글자.
- **텍스트 버튼** 36px, 14px/500. 패딩 없이 테두리·배경 없이 `--ink-2` 글자만 두고,
  hover는 배경 없이 `--ink-1`로 글자색만 바뀐다. 아이콘은 16px, 글자와 8px 간격.
  '목록으로' 같은 보조 내비게이션에 쓴다. 목록을 더 불러오는 동작은 '더보기' 버튼
  대신 스크롤 감지(무한 스크롤)로 처리하고, 불러오는 동안만 상태 줄을 보여준다.
- **인풋** 40px, label 14px + 8px + 컨트롤. focus는 `--primary` 테두리,
  오류는 `--danger` 테두리 + 메시지, textarea 최소 72px.
- **칩** 36px, 글자 12px, 좌우 8px, 칩 사이 8px. 알약. active는 `--ink-1` 채움 + 흰 글자 + 600.
- **대여 기간 선택** 빠른 선택 칩(1·3·7·14·30일)과 날짜 입력이 하나의 값을 공유한다.
  칩은 오늘+N일을 채우고, 날짜를 직접 고르면 해당하는 칩이 자동으로 켜진다. 선택한
  날짜는 `12월 4일 (금)에 반납`처럼 실제 반납일로 되읽어 준다(최소 내일, 최대 30일).
- **배지** 12px 알약 + 점 6px, 좌우 8px. 상태는 텍스트가 말한다 — 색만으로 구분하지 않는다.
- **태그** 24px 알약, 12px, 좌우 8px. 분류·대표처럼 상태 변화가 없는 라벨.
- **물품 카드** 사진 3:2, 본문 16px, hover는 테두리만(`--border-strong`). 확대 효과 없음.
  담을 수 있는 수량이 있는 카드에는 사진 우측 상단에 32px `담기` 칩을 겹친다(회원·관리자
  목록 공통). 담긴 뒤에는 `담김`이고, 한 번 더 누르면 장바구니에서 빠진다. 수량은
  카드에 숫자로 쓰지 않고 장바구니 화면의 스테퍼에서 조절한다.
- **행 카드** 목록·장바구니·대여 행은 16px 패딩, 제목 아래 보조 줄은 8px 간격으로 쌓는다.
  부가 조작(수량 스테퍼·빼기)은 12px 위 구분선 아래에 둔다.
- **페이지 헤더** 제목 오른쪽에 액션을 두고, 640px 미만에서는 액션이 다음 줄로 내려가
  폭을 나눠 갖는다.
- **수량 스테퍼** 40px, 가운데 숫자 입력. 최대가 1이면 조절 버튼 없이 `1개` 고정 표시를
  유지한다. 입력은 blur에서 1~최대 범위로 보정한다.
- **장바구니 하단 바** 물품 현황에서만, 담긴 종류가 있을 때만 화면 아래에 고정한다.
  담긴 종류 수·총 수량과 `신청하기` 링크만 두고, 본문·푸터가 가리지 않게 같은 높이의
  아래 여백을 준다.
- **모달** `--shadow-modal`, 오버레이, Esc 닫기, 열었던 요소로 포커스 복귀.
- **브랜드 로고** `BrandLogo` — `web/public/logo.svg` 하나를 `--surface` 원형 칩에 넣는다.
  칩과 로고의 크기 차이는 4px로 고정하고, 헤더는 `sm`(32/24px), 로그인은
  `lg`(48/40px, 600px 이상 56/48px)을 쓴다. 파비콘·터치 아이콘도 같은 SVG에서 파생한다.

모든 인터랙티브 요소는 default / hover / focus-visible(2px `--primary`) / active /
disabled / loading / error / empty / mobile 390을 확인한다.
터치 타깃은 최소 24×24px, 주요 컨트롤은 32–40px.

## 스타일 작성

- **`web/`은 Tailwind v4 유틸리티 클래스만 쓴다.** 값은 `tokens.css`의 CSS 변수를
  `tailwind.css`의 `@theme inline`으로 노출한 토큰 유틸리티(`bg-surface`, `text-ink-2`,
  `rounded-card`)로만 참조한다. 임의 hex·중간 px 값은 만들지 않는다.
- `npm run check:design`(=`npm run check`에 포함)이 간격·글자 크기·행간·기본 팔레트/hex
  색상 클래스가 토큰 눈금을 벗어나면 실패한다.
- 같은 규격이 2곳 이상에서 반복되면 `components/ui/`의 컴포넌트로 올린다
  (`Button`, `TextButton`, `Badge`, `Tag`, `Chip`, `Empty`, `Input`, `SearchField`, `Modal`, `Notice`, `PageHeader`, `DocPage`, `DocArticle`, `InfoList`).
