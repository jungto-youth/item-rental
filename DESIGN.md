# DESIGN.md — 디자인 원칙

애플의 타이포·여백 감성과 구글 머티리얼 3의 표면 위계·상태 색 체계를 **절제해서** 섞은 것이 기준이다. "꾸미지 않는 것"이 기본값 — 장식은 상태 전달에 필요한 최소한만.

## 1. 원칙

1. **여백이 구조다** — 구분선·그림자보다 간격으로 위계를 만든다. 카드 안 패딩은 넉넉히(16px), 카드 사이는 12px.
2. **그림자 없음** — 면의 위계는 배경색 톤 차(`--color-bg` < `--color-surface`)와 1px 보더로만. `box-shadow` 금지.
3. **타이포 위계는 크기와 무게로** — 굵기 600/500/400 세 단계만. 본문은 시스템 산세리프(SF Pro → system-ui), 행간 1.6 이상.
4. **색은 의미만** — 브랜드/포인트 컬러는 주요 CTA와 링크에만. 상태(성공·경고·위험·정보)는 톤 토큰 배지로만 표현. 장식적 색 사용 금지.
5. **라운드는 두 가지** — 카드/입력 12px(`--radius`), 배지/칩 999px(필). 그 외 반경 금지.
6. **터치 타깃 44px** — 모든 클릭 요소는 최소 높이 44px (모바일 우선 UI).

## 2. 색 토큰 (tokens.css)

두 테마(라이트/다크)에서 같은 토큰 이름을 쓴다. 값은 tokens.css 참조.

| 토큰 | 용도 |
|---|---|
| `--color-bg` / `--color-surface` | 페이지 배경 / 카드·헤더 표면 (톤 차로 위계) |
| `--color-border` | 1px 구분선·보더 |
| `--color-text` / `--color-muted` | 본문 / 보조 텍스트 |
| `--color-primary` / `--color-primary-text` | CTA·링크 / 그 위의 글자 |
| `--color-success/warning/danger` | 상태 아이콘·강조선 (배경으로 쓰지 않음) |
| `--tone-*-bg` / `--tone-*-text` | 상태 배지·알림 배경/글자 쌍 (success·warning·danger·info·violet) |

## 3. 타이포

```
페이지 제목   1.15rem / 600
섹션 제목    0.95rem / 600
본문         0.9rem  / 400  (행간 1.6)
보조·캡션    0.8rem  / 400  (--color-muted)
배지·칩      0.72rem / 600
```

폰트: `--font-body` (system-ui, -apple-system, 'Apple SD Gothic Neo', …)

## 4. 컴포넌트 규칙

- **카드**: `--color-surface` + 1px 보더 + radius 12px + padding 16px. 내부 요소 간격 8px.
- **버튼**: 필(채움) 버튼이 기본. `--color-primary` 배경 + `--color-primary-text` 글자, radius 12px, 높이 44px, 굵기 600. 보조 버튼은 투명 배경 + 보더. 텍스트 버튼(링크형)은 `--color-primary` 글자만.
- **입력**: `--color-surface` 배경 + 1px 보더 + radius 12px, 높이 44px, 패딩 12px. 포커스 시 보더가 `--color-primary`로.
- **배지(`<x-badge>`)**: 필 칩형 — 톤 토큰 배경+글자, radius 999px, 0.72rem.
- **테이블**: 헤더 없이 행 중심. 행 구분은 1px 보더, 셀 패딩 12px. 좌우 스크롤 허용.
- **토스트/알림**: 톤 토큰 배경의 필 카드.

## 5. 테마

- 3단계: 시스템 자동(기본) / 라이트 / 다크 — `data-theme` 속성 + localStorage(`theme`).
- 다크는 라이트의 반전이 아니라 별도 팔레트(톤 다운된 상태색 포함). tokens.css의 두 블록은 수동 동기화.

## 6. 적용 위치

- `web/src/styles/tokens.css` — 토큰 단일 진실원천
- `web/src/components/ui/*` — 배지 등 재사용 컴포넌트
- `web/src/pages/*`, `web/src/app-shell.ts` — 각 페이지 Lit `css`
- 새 화면 추가 시 이 문서의 규칙을 따르고, 새 토큰이 필요하면 tokens.css에 먼저 추가한다.
