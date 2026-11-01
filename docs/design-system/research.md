# 조사 노트

이 프로젝트에 적용할 원칙만 추린 출처와 요약이다.
전체 목록은 각 절의 링크에서 확인한다.

## 1. 디자인 시스템의 범위

**NN/g — Design Systems 101**

- 디자인 시스템은 “표준의 집합”이며, 저장소(스타일 가이드·컴포넌트·패턴)와 **사람**으로 구성된다.
- 도입 방식은 **Adopt / Adapt / Create** 세 가지다.
- 커스터마이징이 많을수록 비용이 커지고, 자체 제작은 장기 유지보수가 필요하다.
- 작은 프로젝트·프로토타입에는 과투자일 수 있다.

**이 프로젝트:** 화면이 10여 개이고 Lit/Shadow DOM 제약이 있으므로 **Adapt**.
참고 시스템의 규격만 가져오고 토큰·컴포넌트는 직접 소유한다.

<https://www.nngroup.com/articles/design-systems-101/>

## 2. 미니멀리즘의 정의

**NN/g — Aesthetic and Minimalist Design (Heuristic #8)**

- 미니멀은 “시각적 트렌드”가 아니라 **과업에 불필요한 노이즈를 제거하는 것**이다.
- 필요한 요소까지 지우면 유용성이 떨어진다.
- 정보 밀도가 높아도 신호가 명확하면 휴리스틱을 만족할 수 있다.
- 링크와 정적 텍스트, 버튼과 라벨을 같은 모양으로 만들지 말 것.

**이 프로젝트:** 테두리·배경을 지우되
버튼의 hover/focus, 인풋의 label/밑줄, 선택 상태, 오류 문구는 남긴다.

<https://www.nngroup.com/articles/aesthetic-minimalist-design/>

## 3. 토큰 구조

**Martin Fowler — Design Token-Based UI Architecture**

- 토큰은 **Option(선택지) → Decision(적용 방식) → Component(적용 위치)** 로 층을 나눈다.
- Option 토큰은 감추고 Decision/Component만 노출하면 변경이 쉬워진다.
- 소규모 프로젝트는 토큰 파이프라인 없이 CSS 변수만으로도 충분하다.
- 토큰은 Git에서 단일 출처로 관리한다.

**이 프로젝트:** 현재 `tokens.css`가 Decision 층 역할.
컴포넌트가 늘면 `--button-bg` 같은 Component 토큰을 추가한다.

<https://martinfowler.com/articles/design-token-based-ui-architecture.html>

## 4. 시각적 방향 합의

**NN/g — Mood Boards in UX**

- 무드보드는 색·타입·질감·레퍼런스를 모아 **시각적 방향을 합의**하는 도구다.
- “예쁘다”보다 “이 요소를 왜 가져오는가”를 설명할 수 있어야 한다.

**이 프로젝트:** Web Awesome·Nord·GOV.UK·Pico의 화면을 모아
“가져올 것 / 가져오지 않을 것”을 표시한 레퍼런스 보드를 만든다.

<https://www.nngroup.com/articles/mood-boards/>

## 5. 시각 회귀 테스트

**Storybook / Playwright**

- 컴포넌트를 고립해 렌더하고, 뷰포트별 스냅샷을 비교한다.
- 토큰 변경이 의도치 않은 화면을 깨뜨리는 것을 막는다.
- 동적 데이터는 마스킹하거나 고정 데이터를 쓴다.

**이 프로젝트:** 이미 Playwright가 있으므로
`web/tests/visual`에 390/768/1280 스냅샷을 추가하는 것이 가장 저렴하다.

<https://storybook.js.org/docs/writing-tests>
<https://playwright.dev/docs/test-snapshots>

## 6. 접근성

**WCAG 2.2 / WAI**

- 텍스트 대비 4.5:1, 큰 텍스트 3:1.
- 포커스가 보이고 가려지지 않아야 한다.
- 포인터 타깃 최소 24×24 CSS px (AA).
- 키보드만으로 모든 기능을 사용할 수 있어야 한다.
- `prefers-reduced-motion`을 존중한다.

**이 프로젝트:** 14px 본문 보조 텍스트의 대비, 텍스트 버튼의 클릭 영역,
모달 포커스 트랩을 우선 점검한다.

<https://www.w3.org/TR/WCAG22/>
<https://www.w3.org/WAI/WCAG22/quickref/>

## 7. 성숙도와 거버넌스

**NN/g — Design-System Maturity**

- 디자인 시스템은 채택·거버넌스·문서화·측정 등 여러 차원에서 성숙해진다.
- 소규모 팀은 “소유자 1명 + 변경 절차 + 문서”만으로도 충분히 성숙할 수 있다.

**이 프로젝트:** `docs/design-system/`를 변경 기록의 기준으로 삼고,
토큰·컴포넌트 변경 시 이 문서를 함께 갱신한다.

<https://www.nngroup.com/articles/design-system-maturity/>

## 8. 참고 시스템

| 시스템 | 참고할 점 | 링크 |
| --- | --- | --- |
| Web Awesome | Lit 기반 컴포넌트 계약·접근성·테마 | <https://webawesome.com/> |
| Nord Design System | 차분한 웹 컴포넌트 톤 | <https://nordhealth.design/> |
| GOV.UK Design System | 폼·오류·빈 상태·플레인 언어 | <https://design-system.service.gov.uk/> |
| Open Props | 토큰 스케일·CSS 변수 구조 | <https://open-props.style/> |
| Pico.css | 문서형 미니멀 룩 | <https://picocss.com/> |
| Simple.css | 클래스리스 최소 스타일 | <https://simplecss.org/> |

## 9. 더 읽을 것

- Brad Frost, *Atomic Design* — 컴포넌트 계층
- Adam Wathan & Steve Schoger, *Refactoring UI* — 여백·타이포·계층
- Alla Kholmatova, *Design Systems* — 패턴 언어와 시스템 사고
- W3C Design Tokens Community Group — 토큰 포맷 표준
