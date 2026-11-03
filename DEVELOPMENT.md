# DEVELOPMENT.md — 개발

## 1. 준비

- Node 24 이상
- `npm ci` — 루트 의존성 한 벌로 서버·웹·web-lit·테스트를 모두 돌린다.

## 2. 실행

```bash
npm run dev           # API(8787) + 웹 HMR(5173) 동시 실행 → http://localhost:5173
npm run dev:api       # API 서버만 → localhost:8787
npm run dev:web:hmr   # 웹(SolidJS) 개발 서버만 → localhost:5173
npm run dev:web       # 빌드 감시 → wrangler(8787)가 서빙하는 번들, 새로고침 필요
npm run dev:lan       # 같은 API 서버를 0.0.0.0 에 → 폰/태블릿에서 실물 검증
npm run dev:web-lit   # Lit 원본 앱 (deprecated) → localhost:5175
```

| 포트 | 무엇 | 비고 |
| --- | --- | --- |
| 5173 | Vite HMR — **개발 중에는 여기로 접속** | `/api`를 8787로 프록시 |
| 8787 | `wrangler dev` — API + `web/dist` | 빌드 결과라 저장이 바로 반영되지 않음 |
| 5175 | Lit 원본 | `dev:api` 필요 |

`npm run dev:lan`은 LAN 전용 플래그를 켠다. 이 플래그가 있어야 `/api/dev/login`이 동작해
계정 없이 로컬 관리자 세션을 만들 수 있다. 공개 호스트나 일반 빌드에서는 플래그가 꺼져
있어 해당 경로가 404로 막힌다.

## 3. 테스트

테스트는 세 층이다.

| 층 | 무엇을 검증하나 | 명령 |
| --- | --- | --- |
| 단위 | "어떤 SQL을 날리는가" — 가짜 DB 스텁 | `npm test` |
| 통합 | "그 SQL이 실제로 무슨 행동을 하는가" — 메모리 SQLite에 `migrations-d1/` 적용 | `npm test` |
| 브라우저 | 실제 코덱·multipart·렌더링 | 아래 개별 명령 |

```bash
npm test              # 단위 + 통합 (DB 불필요)
npm run test:web      # 배포 앱(SolidJS) 390/1280 스모크 (fixture API)
npm run test:photos   # Lit 원본 사진 파이프라인 (chromium 필요)
npm run test:members  # Lit 원본 회원 전용 이동·등록 정보 삭제
npm run test:profile  # Lit 원본 프로필 저장
npm run test:visual   # Lit 원본 390/768/1280 시각 회귀
npm run test:visual:update  # 시각 회귀 기준선 갱신
```

브라우저 테스트는 CI가 아니라 로컬에서 돌린다.

```bash
npx playwright install chromium
```

- 시각 회귀 기준선은 `web-lit/tests/visual/baseline/`에 있고, 실패 시 현재 화면은
  `current/`(gitignore)에 남는다.
- 기준선은 **같은 브라우저/OS에서만** 일치한다. 다른 환경에서 갱신하면 전부 어긋난다.
- `test:web` 스크린샷은 `web/tests/visual/current/`에 남고 커밋하지 않는다.

## 4. 타입 검사 · 빌드

```bash
npm run check              # tsc: web · web-lit · server · tests · scripts
npm run build              # 배포할 SolidJS 앱 빌드 → web/dist
npm run build:web-lit      # Lit 원본 빌드 (deprecated) → web-lit/dist
npm run check:production   # 개발용 로그인 경로가 번들에 없는지 확인
npm run preview:web        # 빌드 결과 미리보기
```

`npm run check`는 타입 검사만 한다. 테스트·빌드와 함께 돌리는 것이 CI와 같은 조건이다.

## 5. Lit 원본 (deprecated) 메모

`web-lit/`은 배포에 쓰지 않는다. 다음 경우에만 만진다.

- 사진 파이프라인 브라우저 테스트(`test:photos`)
- 시각 회귀 기준선(`test:visual`)
- SolidJS 구현과 동작을 비교할 때

배포 앱의 동작을 바꾸는 변경은 `web/`에만 반영하면 된다.

## 6. 문제 해결

- **저장했는데 화면이 안 바뀐다** — 8787로 접속했을 가능성이 크다. 5173을 쓴다.
- **로그인 후 5173으로 안 돌아온다** — 구글 콜백은 8787로 돌아온다. 세션 쿠키는 포트와
  무관하므로 5173으로 다시 이동하면 된다.
- **`redirect_uri_mismatch`** — 서버가 `127.0.0.1` 요청을 `localhost`로 정규화한다.
  구글 콘솔에는 `http://localhost:8787/api/auth/callback/google`이 등록되어 있어야 한다.
- **포트가 이미 사용 중** — Vite는 `strictPort`라 5174로 밀리지 않고 바로 실패한다.
  점유한 프로세스를 정리한다.
- **DB 스키마가 안 맞는다** — 로컬 D1에 `migrations-d1/`을 적용한다
  ([OPERATIONS.md](OPERATIONS.md) §3).
