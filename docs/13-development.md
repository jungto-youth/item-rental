# 13 — 개발

Node 준비, 개발 서버 포트, 타입 검사·빌드 명령, 자주 만나는 문제와 해결. 테스트는
[14 테스트](14-testing.md)를 본다.

## 준비

- Node 24 이상
- `npm ci` — 루트 의존성 한 벌로 서버·웹·테스트를 모두 돌린다.

## 실행

```bash
npm run dev           # API(8787) + 웹 HMR(5173) 동시 실행 → http://localhost:5173
npm run dev:api       # API 서버만 → localhost:8787
npm run dev:web:hmr   # 웹(SolidJS) 개발 서버만 → localhost:5173
npm run dev:web       # 빌드 감시 → wrangler(8787)가 서빙하는 번들, 새로고침 필요
npm run dev:lan       # 같은 API 서버를 0.0.0.0 에 → 폰/태블릿에서 실물 검증
```

| 포트 | 무엇 | 비고 |
| --- | --- | --- |
| 5173 | Vite HMR — **개발 중에는 여기로 접속** | `/api`를 8787로 프록시 |
| 8787 | `wrangler dev` — API + `web/dist` | 빌드 결과라 저장이 바로 반영되지 않음 |

`npm run dev:lan`은 LAN 전용 플래그를 켠다. 이 플래그가 있어야 `/api/dev/login`이 동작해
계정 없이 로컬 관리자 세션을 만들 수 있다. 공개 호스트나 일반 빌드에서는 플래그가 꺼져
있어 해당 경로가 404로 막힌다.

## 타입 검사 · 빌드

```bash
npm run check              # tsc: web · server · tests · scripts
npm run build              # 배포할 SolidJS 앱 빌드 → web/dist
npm run check:production   # 개발용 로그인 경로가 번들에 없는지 확인
npm run preview:web        # 빌드 결과 미리보기
```

`npm run check`는 타입 검사만 한다. 테스트·빌드와 함께 돌리는 것이 CI와 같은 조건이다.

## 문제 해결

- **저장했는데 화면이 안 바뀐다** — 8787로 접속했을 가능성이 크다. 5173을 쓴다.
- **로그인 후 5173으로 안 돌아온다** — 구글 콜백은 8787로 돌아온다. 세션 쿠키는 포트와
  무관하므로 5173으로 다시 이동하면 된다.
- **`redirect_uri_mismatch`** — 서버가 `127.0.0.1` 요청을 `localhost`로 정규화한다.
  구글 콘솔에는 `http://localhost:8787/api/auth/callback/google`이 등록되어 있어야 한다.
- **포트가 이미 사용 중** — Vite는 `strictPort`라 5174로 밀리지 않고 바로 실패한다.
  점유한 프로세스를 정리한다.
- **DB 스키마가 안 맞는다** — 로컬 D1에 `migrations-d1/`을 적용한다
  ([16 데이터베이스 운영](16-database-operations.md)).
- **`wrangler dev`가 "bindings that need to run remotely ... could not be authenticated"로
  죽는다** — AI 바인딩은 로컬 실행 중에도 원격 세션이 필요하다. 로그인 계정과 D1·R2 소유
  계정이 다르거나 `node_modules/.cache/wrangler/wrangler-account.json`에 옛 계정이 캐시돼
  있으면 인증에 실패한다. 여러 Cloudflare 계정을 쓴다면 프로젝트 `.env`(gitignore됨)에
  계정 전용 프로필을 고정하면 `wrangler logout`/`login` 반복 없이 해결된다.

  ```bash
  # .env
  XDG_CONFIG_HOME=/Users/<user>/.wrangler-profiles/<account>
  CLOUDFLARE_ACCOUNT_ID=<account id>
  ```

  프로필 디렉터리에서 한 번만 `XDG_CONFIG_HOME=... npx wrangler login` 하면 되고,
  옛 캐시는 `rm -rf node_modules/.cache/wrangler`로 지운다.
