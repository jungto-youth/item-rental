# 물품 대여 — SolidJS 목업

`design/`의 정적 HTML 시안 12개 화면을 **SolidJS SPA**로 옮긴 리뷰용 목업입니다.
실제 앱(`web-lit/src`, Lit)과 서버 API는 건드리지 않았고, 데이터는 모두 메모리 안의 샘플입니다.

- 스타일: Tailwind CSS v4 + `design/`의 디자인 토큰
- 라우팅: `@solidjs/router` 2의 `createRouter` + `hashHistory()` — 정적 서버 없이도 새로고침이 됩니다.
- 상태: `src/store.tsx`의 Solid Store(draft setter). 새로고침하면 초기 샘플로 돌아갑니다.
- 역할: 기본은 `회원`입니다. 관리자 전용 화면을 열면 권한 안내가 뜨고 `관리자로 보기`로 전환합니다. 로그아웃하면 다시 회원으로 돌아갑니다. 선택은 `sessionStorage`에 남습니다.

## 실행

```bash
npm run dev:solid      # http://localhost:5174
npm run build:solid    # solid/dist
npm run preview:solid  # 빌드 결과 미리보기
```

루트 의존성을 함께 쓰므로 별도 `npm install`은 필요 없습니다.

## Solid 2.0 기준

2026-11에 **Solid 2.0 RC**(`solid-js@next`)와 **Solid Router 2**로 올렸습니다.
1.x와 다른 점 중 이 목업에 실제로 적용된 것:

- `solid-js/web` → `@solidjs/web` (`render`, `JSX` 타입). `tsconfig`의 `jsxImportSource`도 `@solidjs/web`.
- 스토어는 `solid-js`에서 바로 가져오고, setter는 **draft를 직접 수정**합니다(`produce` 제거).
  예: `setState("role", role)` → `setState(s => { s.role = role; })`
- `onMount` → `onSettled`. 정리 함수는 `onCleanup` 등록 대신 **반환**합니다.
- `createEffect(fn)` → `createEffect(compute, apply)`. `apply`가 cleanup을 반환합니다.
- 컴포넌트 본문 최상위에서 signal/memo/store를 읽으면 경고가 나므로, 초기값은 `untrack`으로 한 번만 읽습니다.
- 라우터: `<HashRouter>`/`<A>`가 없어졌습니다.
  `createRouter({ history: hashHistory(), routes })`를 모듈 스코프에서 만들고 `<Router>{props => <Shell {...props} />}</Router>`로 마운트합니다.
  링크는 평범한 `<a>`이고, 해시 URL이 유지되도록 `src/components/link.tsx`가 `useHref`로 `#`을 붙입니다.
- JSX의 `src="./logo.png"` 같은 상대 경로를 번들러가 모듈로 해석하므로, 로고는 `src/logo.ts`에서 import 합니다.


## 화면

| 경로 | 화면 | 비고 |
| --- | --- | --- |
| `/` | 물품 현황 | 검색·상태 필터·더보기·빈 상태 |
| `/items/:id` | 물품 상세 | 갤러리·수량 스테퍼·대여 성공·대여 불가 |
| `/items/new` | 물품 등록 | 검증·태그·사진·이탈 확인 |
| `/items/:id/edit` | 물품 수정 | 등록과 같은 폼, 삭제·공개 보기 |
| `/login` | 로그인 | `?error=denied\|deactivated\|unavailable` |
| `/signup-profile` | 프로필 등록 | 이름·연락처 검증 |
| `/mypage` | 내 정보 | 표시/수정, `?nophone=1` 배너 |
| `/my-rentals` | 대여 내역 | 반납·취소 확인 모달, 이력 |
| `/admin/reservations` | 대여 관리 | 상태 필터·반납 처리 |
| `/admin/members` | 회원 관리 | 검색·역할·탈퇴·정보 삭제·허용 이메일 |
| `/policy?kind=terms\|privacy` | 정책 | 탭·목차 앵커·표 |
| `/states` | 상태 화면 | 로딩·빈·오류·대여 불가 갤러리 |
| `/404` | 404 | 공개 헤더·흰 푸터 |

관리자 전용 화면(물품 등록/수정·대여 관리·회원 관리)을 `회원` 역할로 열면
앱과 같이 **관리자 권한 안내**가 뜨고, `관리자로 보기`로 바로 전환할 수 있습니다.
## 구조

```
solid/
  index.html
  vite.config.ts
  src/
    index.tsx              — 라우터·앱 셸
    styles.css             — Tailwind v4 @theme + 공통 규칙
    store.tsx              — 목업 상태와 액션
    types.ts               — 화면 데이터 타입
    data/mock.ts           — 샘플 물품·대여·회원·허용 이메일
    components/
      layout.tsx           — 헤더·푸터·FAB
      ui.tsx               — 버튼·칩·배지·모달·빈 상태
      item-card.tsx        — 물품 카드·스켈레톤
      admin-guard.tsx      — 관리자 권한 안내
      icons.tsx
    pages/                 — 위 표의 12개 화면
```

## 시안과 다른 점

- 홈 목록은 `design/`처럼 **대여 가능·대여 중·수리 중**만 보여줍니다.
  `states`용 소모품·폐기 샘플은 목록에서 제외됩니다.
- `더보기`는 샘플 2건을 더 불러옵니다(시안은 10건 고정).
- 상세에서 대여하면 재고와 대여 내역이 함께 바뀌고 성공 화면이 나옵니다.
- 물품 폼 저장은 목록으로 돌아가지 않고 `등록했어요` / `수정했어요`를 남깁니다(시안과 같음).
- 대여·관리·회원 화면의 변경은 메모리에만 남습니다.

## 실제 앱에 연결할 때

`src/store.tsx`의 액션(`rentItem`, `returnMyReservation`, `returnReservation`, …)을
`web-lit/src/api/client.ts` 호출로 바꾸고, `data/mock.ts` 초기값을 API 응답으로 교체하면 됩니다.
화면 컴포넌트는 스토어 액션에만 의존하므로 페이지를 다시 쓰지 않아도 됩니다.
