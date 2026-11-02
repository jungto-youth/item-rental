# 컴포넌트

컴포넌트는 “모양”이 아니라 **계약**이다.
같은 이름의 컴포넌트가 화면마다 다르게 생기면 시스템이 아니다.

## 1. 계약 템플릿

새 컴포넌트를 만들거나 고칠 때 아래를 채운다.

```md
### 이름

- 목적: 사용자가 무엇을 하는가
- 구조: label / hint / error / icon / count ...
- 변형: primary / secondary / danger
- 크기: sm / md / lg (높이·패딩·글자)
- 상태: default / hover / active / focus-visible / disabled / loading / error
- 동작: 클릭·키보드·Esc·포커스 트랩
- 문구: 동작을 그대로 (“저장”, “대여하기”)
- 접근성: 역할·이름·상태·터치 타깃
- 하지 말 것: ...
```

## 2. 핵심 컴포넌트와 상태

| 컴포넌트 | 변형 | 반드시 정의할 상태 |
| --- | --- | --- |
| 버튼 | primary / secondary / danger | hover, focus-visible, disabled, loading |
| 인풋 | text / textarea / number | focus, disabled, required, error |
| 칩·탭 | sm / lg | active, disabled, focus-visible |
| 배지 | 상태 텍스트 | — (읽기 전용) |
| 모달 | 기본 | open, close, Esc, 포커스 트랩, 스크롤 잠금 |
| 공지 | info / danger | action 유무 |
| 빈 상태 | loading / empty / error | action 유무 |
| 물품 카드 | 사진 유무 | hover, focus-visible |
| 행 목록 | 일반 / 강조 | 마지막 행, 모바일 줄바꿈 |
| 사진 업로더 | 0–3장 | 업로드 중, 오류, 삭제 |

## 3. 현재 규격

### 버튼

- 높이: 약 37px (위아래 8px · 좌우 16px 패딩 + 16px 글자 + 테두리)
- 글자: 16px / 600
- primary: `--primary` 채움 + 흰 글자, hover 시 `--primary-strong`
- secondary: 흰 바탕 + `--border` 테두리, hover 시 `--surface-muted`
- danger: 흰 바탕 + `--danger` 테두리·글자
- focus-visible: 2px `--primary` 외곽선
- disabled: opacity 0.45
- loading: 스피너 + 클릭 차단

### 인풋

- 높이: 약 37px (8px 세로 · 16px 가로 패딩)
- 구조: label(14px) + 8px + control
- control: 흰 바탕 + 1px `--border` + 8px 라운드
- focus: `--primary` 테두리
- error: `--danger` 테두리 + 메시지
- textarea: 최소 72px, 세로 확장

### 셀렉트

- 높이·패딩·테두리·글자 크기는 인풋과 동일 (약 37px, 16px)
- 네이티브 화살표 또는 동일 크기의 커스텀 화살표
- focus: `--primary` 테두리

### 칩·탭

- 높이: 약 37px (8px/16px 패딩) / 44px (lg)
- 글자: 16px (개수는 14px)
- 기본: 흰 바탕 + `--border` + 알약
- active: `--ink-1` 채움 + 흰 글자 + 600
- 칩 사이 8px
- focus-visible: 2px `--primary` 외곽선

### 배지

- 14px 알약 + 상태 점
- 기본: `--surface-muted` / `--ink-2`
- 대여 가능·관리자: `--primary-soft` / `--primary-strong`
- 수리 중: `--warning-soft` / `--warning`
- 상태는 텍스트가 말한다. 색만으로 구분하지 않는다.

### 물품 카드

- 흰 카드 + 1px `--border` + 8px 라운드
- 카드 사이 8px
- 사진 4:3, 바탕 `--surface-muted` (사진 없으면 아이콘+“사진 없음”)
- 본문 padding 16px, gap 8px
- 이름: 16px / 600
- 분류·위치: 14px / `--ink-2`
- 상태: 점 + 텍스트, 대여 가능은 `--primary`
- hover: 테두리 `--border-strong`만. 확대 효과 없음

### 행·카드 목록

- 흰 카드 + 1px `--border` + 8px 라운드
- padding: 16px
- 카드 사이 8px
- active 행: 테두리 `--ink-1`

### 모달

- 흰 면 + 1px `--border` + 8px 라운드
- `--shadow-modal`로 떠 있는 층을 표시
- 배경 오버레이 + 페이드
- 제목·본문·푸터 구조
- Esc 닫기, 포커스 트랩, 열었던 요소로 포커스 복귀

## 4. 미니멀 UI 주의점

미니멀은 “선을 다 지우는 것”이 아니다.
아래 신호는 반드시 남긴다.

| 지우면 안 되는 것 | 대체 신호 |
| --- | --- |
| 버튼의 테두리·배경 | hover 밑줄, 600 굵기, 충분한 클릭 영역 |
| 인풋의 필드 경계 | label + 아래 1px 선 + focus 시 진한 선 |
| 선택 상태 | 굵기 + 밑줄 + `aria-pressed` |
| 오류 | `--danger` + 구체적인 문장 |
| 포커스 | 2px 외곽선 |
| 터치 타깃 | 최소 24×24px, 주요 컨트롤 32–40px |

## 5. 하지 말 것

- 화면마다 버튼 높이·패딩을 새로 만들기
- 텍스트 버튼을 라벨처럼 보이게 두기 (hover·focus·문구로 보완)
- 인풋을 정적 텍스트처럼 보이게 두기 (label·focus·placeholder)
- 14px 미만 글자
- 회색 텍스트를 대비 확인 없이 쓰기
- 색만으로 상태 구분
- 0이 아닌 라운드, 그림자, 그라데이션, 확대 효과
