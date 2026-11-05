# 15 — 배포와 설정

배포 순서, 배포 전 확인, 환경 변수와 시크릿. DB 마이그레이션은
[16 데이터베이스 운영](16-database-operations.md)을 본다.

## 배포

```bash
npm run deploy        # vite build → wrangler deploy
```

- 산출물은 `web/dist`이고, Worker가 Static Assets로 서빙한다.
- 배포 전에 CI와 같은 조건을 확인한다.

```bash
npm run check
npm test
npm run build
npm run check:production
```

`check:production`은 개발용 로그인 경로(`/api/dev/login`)가 운영 번들에 남아 있지 않은지
확인한다.

- DB 마이그레이션이 필요한 코드는 **마이그레이션을 먼저** 적용한다. 새 코드가 새 컬럼을
  참조하면 코드만 먼저 배포한 동안 해당 API가 500이 난다. 마이그레이션은 구코드와
  호환되게(additive) 작성한다 — 예: `0013`의 nullable `thumb_r2_key`.

## 환경 변수

로컬은 `.dev.vars`, 운영은 `wrangler secret put`으로 넣는다.

| 변수 | 용도 |
| --- | --- |
| `AUTH_SECRET` | 세션 서명 시크릿 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 구글 로그인 클라이언트 |
| `AUTH_ALLOWED_EMAILS` | 로그인 허용 예외 이메일(콤마 구분) — DB 조회 실패 시 폴백 |

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
npx wrangler secret put AUTH_ALLOWED_EMAILS
```

정식 예외 목록은 DB `allowed_emails` 테이블이며 관리자 화면에서 관리한다.
`AUTH_ALLOWED_EMAILS`는 비상용 폴백이다. 허용 목록에서 이메일을 지우면 그 계정의 기존
세션도 다음 요청부터 막힌다(로그인 때와 같은 기준을 매 요청에 확인한다). 관리자 본인이
예외 계정이면 자기 이메일을 지우는 순간 관리 화면에 들어올 수 없으니 주의한다.

정토회 계정(`@jungto.org`)은 막을 수 없다. 탈퇴 처리해도 다시 로그인하면 복구되고, 등록 정보를
삭제해도 새 회원으로 가입된다([04 회원 관리](04-member-management.md)). 문제가 있는 회원의 대여는
신청 거절로 대응한다.
