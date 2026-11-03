# 물품 대여 — SolidJS 실제 앱

`web/src`의 Lit 앱을 **SolidJS로 옮긴 실제 동작 앱**입니다.
`design/`의 시안을 디자인 기준으로 쓰고, API·세션·권한·사진 업로드까지 `web/`과 같은
서버 계약에 연결합니다. (`solid/`는 샘플 데이터만 쓰는 리뷰용 목업입니다.)

- UI: Solid 2 RC (`@solidjs/web`) + `solid-js`
- 라우팅: 경로 기반 히스토리 라우터 (`src/router.tsx`) — 가드·리다이렉트·스크롤 복원 포함
- 상태: Solid signal — 세션은 `src/context/session.ts`, 화면 데이터는 각 페이지가 소유
- 스타일: `web/src/styles/tokens.css`를 그대로 쓰고, Lit Shadow DOM CSS를
  `src/styles/app.css`의 범위 클래스로 옮겼습니다. Tailwind는 쓰지 않습니다.
- API: `web/src/api/client.ts`와 같은 fetch 래퍼·에러 코드 규약

## 실행

API(8787)와 web-solid HMR(5175)을 함께 띄웁니다.

```bash
# 터미널 1 — Hono API + wrangler
npm run dev:api

# 터미널 2 — Solid 앱
npm run dev:web-solid      # http://localhost:5175
```

`web-solid/vite.config.ts`가 `/api`를 `http://localhost:8787`로 프록시합니다.
루트 의존성을 함께 쓰므로 별도 `npm install`은 필요 없습니다.

```bash
npm run build:web-solid    # web-solid/dist
npm run preview:web-solid  # 빌드 결과 미리보기
npm run test:web-solid     # Playwright 스모크 테스트 (fixture API)
```

배포할 때는 `wrangler.jsonc`의 `assets.directory`를 `./web-solid/dist`로 바꾸거나
빌드 결과를 `web/dist`에 맞춰 옮깁니다. 서버 API·D1·R2·인증은 그대로 씁니다.

## 화면

`web/`과 같은 경로를 씁니다.

| 경로 | 화면 | 접근 |
| --- | --- | --- |
| `/` | 물품 현황 — 검색·상태 필터·더보기·관리자 모드 | 로그인 |
| `/items/:id` | 물품 상세 — 갤러리·수량 스테퍼·대여 | 로그인 |
| `/items/new` | 물품 등록 — 검증·태그·사진 | 관리자 |
| `/items/:id/edit` | 물품 수정 — 삭제·공개 보기 | 관리자 |
| `/login` | 구글 로그인 · 로컬 테스트 로그인 | 공개 |
| `/signup/profile` | 최초 로그인 후 이름·연락처 등록 | 로그인 |
| `/mypage` | 내 정보 — 표시/수정, 연락처 미등록 배너 | 로그인 |
| `/my/rentals` | 대여 내역 — 반납·취소·이력 | 로그인 |
| `/admin/reservations` | 대여 관리 — 상태 필터·반납 처리 | 관리자 |
| `/admin/members` | 회원 관리 — 역할·탈퇴·정보 삭제·허용 이메일 | 관리자 |
| `/policy/:kind` | 이용약관 · 개인정보 처리방침 | 공개 |
| 그 외 | 404 | 공개 |

- 로그인·프로필 등록은 헤더·푸터 없는 전체 화면입니다.
- 관리자 전용 화면을 회원으로 열면 `/?role=denied`로 보내 홈에 권한 안내를 띄웁니다.
- 보호 화면은 세션 확인이 끝날 때까지 이전 화면(첫 진입은 로딩)을 유지합니다.

## 구조

```
web-solid/
  index.html
  vite.config.ts
  src/
    main.tsx                 — 앱 진입점·401 처리
    router.tsx               — 경로 매칭·가드·리다이렉트·스크롤 복원
    context/session.ts       — /api/me 세션 캐시·refresh
    api/client.ts            — fetch 래퍼·ApiError
    styles/
      tokens.css             — web/src/styles/tokens.css 복사 (값의 단일 출처)
      app.css                — 셸·UI·화면 CSS (Lit Shadow DOM CSS 포팅)
    components/
      layout.tsx             — 헤더·본문·푸터·FAB
      app-header.tsx / app-footer.tsx
      ui/                    — 버튼·배지·칩·인풋·모달·빈 상태·안내·페이지 헤더
      admin/admin-page.tsx   — 관리자 페이지 골격
      common/                — 프로필 폼·예약 행
      features/item/         — 카드·갤러리·탐색기·대여 폼·사진 업로더·카메라
      features/category/     — 태그 입력
    pages/                   — 위 표의 화면
    utils/                   — 날짜·재고·사진·카테고리·확인 모달
  tests/
    smoke.browser.test.mjs   — 390/1280 렌더·콘솔 오류·핵심 상호작용
```

## web/과 다른 구현 방식

화면·문구·API 계약은 `web/`과 같고, 렌더링 기반만 다릅니다.

- **Shadow DOM → 전역 CSS**: Lit 컴포넌트의 `:host`/내부 선택자를 고유 루트 클래스로
  옮겨 같은 시각 결과를 냅니다. 디자인 토큰은 `tokens.css` 한 벌만 씁니다.
- **Lit 라우터 → 자체 라우터**: 경로 매칭, `requireSession`/`requireAdmin` 가드,
  `replaceState` 리다이렉트, 뒤로가기 스크롤 복원을 `src/router.tsx`에 모았습니다.
- **세션**: `/api/me` 캐시·세대 번호·401 처리 규약을 그대로 옮겼습니다. Solid 2의
  signal 쓰기는 flush 전까지 읽기에서 보이지 않을 수 있어, 같은 async 흐름에서는
  받은 값을 지역 변수로 돌려줍니다.
- **확인 모달**: `confirmDialog()`가 Promise를 반환하고, 루트의 `ConfirmHost`가
  모달 한 벌로 렌더합니다.
- **사진**: 업로드 전 1600px·2MB 축소(`utils/photo.ts`), 3장 슬롯, 촬영/업로드 선택,
  저장 시 일괄 반영까지 `web/`과 같습니다.

## 검증

`npm run test:web-solid`는 고정 fixture API로 다음을 확인합니다.

- 비로그인 보호 화면 → `/login` 리다이렉트
- 12개 화면 390/1280 렌더 및 콘솔 오류 없음
- 상세 대여 성공 상태
- 홈 검색·상태 필터
- 정책 탭 이동
- 회원 관리 — 대여 중 삭제 차단·확인 모달·삭제
- 프로필 저장 → 내 정보 반영
- 390px 가로 스크롤 없음

스크린샷은 `tests/visual/current/`에 남고 커밋하지 않습니다.
