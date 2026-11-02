# 디자인 시스템

이 문서는 이 프로젝트의 UI를 **미니멀하고 일관되게** 유지하기 위한 기준이다.
디자인 시스템은 “예쁜 컴포넌트 모음”이 아니라 **반복되는 디자인 결정을 줄이는 장치**다.

- 대상: Lit + Shadow DOM SPA (`web/src`)
- 현재 기준: 중립 회색 바탕 + 흰 카드 + 오렌지 포인트 + 8px 간격
- 단일 출처: [`web/src/styles/tokens.css`](../../web/src/styles/tokens.css)

## 1. 전략: Adopt가 아니라 Adapt

Nielsen Norman Group은 디자인 시스템 도입을 세 가지로 나눈다.

| 전략 | 내용 | 이 프로젝트 |
| --- | --- | --- |
| Adopt | 기존 시스템을 그대로 사용 | 부적합 — 화면 수가 적고 브랜드 톤이 다름 |
| **Adapt** | 참고 시스템을 변형해 자체 시스템 구축 | **채택** — 참고는 하되 토큰·컴포넌트는 직접 소유 |
| Create | 처음부터 자체 제작 | 과투자 — 유지보수 비용이 큼 |

참고할 시스템:

- [Web Awesome](https://webawesome.com/) — Lit 기반 웹 컴포넌트. 컴포넌트 계약·접근성 참고
- [Nord Design System](https://nordhealth.design/) — 차분한 웹 컴포넌트 톤
- [GOV.UK Design System](https://design-system.service.gov.uk/) — 폼·오류·빈 상태 패턴
- [Open Props](https://open-props.style/) — 토큰 스케일 참고
- [Pico.css](https://picocss.com/) / [Simple.css](https://simplecss.org/) — 문서형 미니멀 룩 참고

> React 기반 시스템(shadcn/ui, Radix, Mantine)은 이 스택에 바로 적용할 수 없다.
> Tailwind 같은 전역 유틸리티는 Shadow DOM 안으로 침투하지 않으므로 쓰지 않는다.
> 이 프로젝트는 **`tokens.css` + Lit `css`** 단일 구조를 쓴다.

## 2. 디자인 원칙

새 화면·컴포넌트를 만들 때 아래 세 문장으로 판단한다.

1. **조용함** — 장식보다 정보. 장식용 그림자·그라데이션·큰 색면을 쓰지 않는다.
2. **빠른 스캔** — 사진 → 이름 → 위치 → 대여 가능 수량 순서로 읽힌다.
3. **명확한 행동** — 화면마다 주 액션은 하나. 빈 상태·오류는 항상 다음 행동을 말한다.

미니멀리즘은 **필요한 신호까지 지우는 것**이 아니다.
NN/g의 미학적·미니멀 디자인 원칙처럼, 과업에 불필요한 노이즈만 줄이고
상태·조작 가능성·오류·포커스는 남긴다.

## 3. 현재 기준값

| 항목 | 값 |
| --- | --- |
| 색 | 잉크 3 + 면 5 + 포인트 3 + 상태 4 (15개) |
| 글자 | 14 / 16 / 20 / 24px |
| 간격 | 8 / 16 / 24 / 32 / 40px |
| 라운드 | 8 / 999px |
| 행간 | 본문 1.5 / 버튼 1.2 |
| 서체 | Noto Sans KR |
| 포커스 | 2px 실선, `--primary` |
| 터치 타깃 | 최소 24×24px (WCAG 2.2 AA), 주요 컨트롤 32–38px |

값을 바꾸려면 반드시 [`tokens.md`](tokens.md)의 절차를 따른다.

## 3.1 현재 상태

적용됨:

- 중립 회색 바탕 + 흰 카드 + 오렌지 포인트
- 14/16/20/24 타입, 8px 간격, 8/12/999 라운드
- 사진 우선 카드, 상태 점·배지, 채운 인풋·버튼
- 데스크톱 상세 2열, 모바일 1열
- 메뉴·모달에만 제한적으로 그림자

아직 남은 것:

- [x] 390/768/1280 시각 회귀 스냅샷 (`npm run test:visual`)
- [ ] axe 접근성 자동 검사
- [ ] 5명 사용성 테스트
- [ ] component 토큰(`--button-*`, `--input-*`) 도입 검토
- [x] `audit.md` 1차 감사 (2026-10-29)

## 3.2 스타일 작성 방식

컴포넌트 스타일은 세 형태 중 하나로 쓴다. 형식이 섞여 보이지 않도록 기준을 고정한다.

| 형태 | 언제 | 예 |
| --- | --- | --- |
| `component.css` + `sheet()` | 기본 — 새로 쓰거나 손대는 컴포넌트 | [`components/ui/chip.css`](../../web/src/components/ui/chip.css) |
| `css\`\`` 템플릿 | 3~5줄짜리 작은 규칙 | [`pages/not-found.ts`](../../web/src/pages/not-found.ts) |
| `styles/ui.ts` 조각 | 두 화면 이상이 공유하는 규격 | `cardCss`, `formCss` |

```ts
import styles from "./chip.css?inline";
static styles = [base, sheet(styles)];
```

`base`([`styles/base.css`](../../web/src/styles/base.css))를 항상 첫 번째에 둔다.
`tokens.css`가 문서에 하던 전역 규칙(서체·행간·box-sizing)을 shadow root마다
복원해 주므로, 컴포넌트 CSS는 자기 레이아웃만 쓰면 된다.
**margin·padding 리셋은 넣지 않는다** — UA 기본 여백에 기대는 화면이 조용히 틀어진다.
유틸리티 클래스(Tailwind)는 쓰지 않는다.

## 4. 문서 지도

| 문서 | 내용 |
| --- | --- |
| [audit.md](audit.md) | 화면·컴포넌트·상태 인벤토리와 감사 체크리스트 |
| [tokens.md](tokens.md) | 토큰 3층 구조, 현재 값, 변경 절차 |
| [components.md](components.md) | 컴포넌트 계약, 상태 매트릭스, 미니멀 UI 주의점 |
| [verification.md](verification.md) | 시각 회귀·접근성·사용성 검증과 거버넌스 |
| [research.md](research.md) | 조사 출처와 요약 |

## 5. 적용 순서

한 번에 전체를 바꾸지 않는다. **수직 슬라이스**로 검증한 뒤 확장한다.

1. **찾기 → 상세 → 대여 신청** (홈, `/items/:id`)
2. **로그인 → 프로필** (`/login`, `/signup/profile`, `/mypage`)
3. **관리자 등록 → 반납** (`/items/new`, `/admin/reservations`)
4. 나머지 화면은 같은 컴포넌트로 교체

## 6. 1주 실행안

| 일 | 할 일 | 산출물 |
| --- | --- | --- |
| 1일 | 화면·상태 인벤토리, 390/768/1280 스크린샷 | `audit.md` 작성 |
| 2일 | 원칙 1페이지, 레퍼런스 보드 | 이 문서 + 참고 화면 |
| 3일 | 토큰 정리(색·타입·간격) | `tokens.css` 개정 |
| 4–5일 | 핵심 컴포넌트 8개 계약 정의 | `components.md` 작성 |
| 6일 | 홈 → 상세 → 대여 신청 적용 | 수직 슬라이스 |
| 7일 | 스냅샷·접근성·5명 테스트 | 검증 리포트 |

## 7. 성공 기준

- 5명 사용성 테스트에서 핵심 과업(찾기/대여/반납)을 대부분 혼자 완료
- 키보드만으로 모든 주요 흐름 이동 가능
- axe critical 위반 0, 본문 텍스트 대비 4.5:1 이상
- 새 화면이 기존 컴포넌트만으로 구성됨 (일회성 스타일 0)
- 390/768/1280 스냅샷에서 의도하지 않은 변화 0
