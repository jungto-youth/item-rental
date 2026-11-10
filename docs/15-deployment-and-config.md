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
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 (선택) — 없으면 알림을 끈다 |
| `TELEGRAM_CHAT_ID` | 알림 받을 관리자 단체방 chat_id (선택, 그룹은 `-100...`) |
| `PUBLIC_BASE_URL` | 알림 메시지의 앱 링크 (선택, 예: `https://item-rental.example.com`) |

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
npx wrangler secret put AUTH_ALLOWED_EMAILS
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

정식 예외 목록은 DB `allowed_emails` 테이블이며 관리자 화면에서 관리한다.
`AUTH_ALLOWED_EMAILS`는 비상용 폴백이다. 허용 목록에서 이메일을 지우면 그 계정의 기존
세션도 다음 요청부터 막힌다(로그인 때와 같은 기준을 매 요청에 확인한다). 관리자 본인이
예외 계정이면 자기 이메일을 지우는 순간 관리 화면에 들어올 수 없으니 주의한다.

정토회 계정(`@jungto.org`)은 막을 수 없다. 탈퇴 처리해도 다시 로그인하면 복구되고, 등록 정보를
삭제해도 새 회원으로 가입된다([04 회원 관리](04-member-management.md)). 문제가 있는 회원의 대여는
신청 거절로 대응한다.

## 텔레그램 알림

`TELEGRAM_BOT_TOKEN`과 `TELEGRAM_CHAT_ID`가 모두 있어야 켜진다. 하나라도 비어 있으면
알림 함수가 조용히 `false`를 돌려주므로 로컬·테스트는 설정 없이 그대로 동작한다.
`PUBLIC_BASE_URL`을 넣으면 메시지에 "대여 관리 열기" 링크가 붙는다.

- 봇 만들기: `@BotFather` → `/newbot` → 토큰 복사
- chat_id: 봇을 관리자 단체방에 초대하고 방에 메시지를 하나 올린 뒤
  `https://api.telegram.org/bot<TOKEN>/getUpdates`에서 `chat.id`를 확인한다(그룹은 음수).
- 알림은 응답 뒤 `ctx.waitUntil`로 전송한다. 전송 실패는 대여 신청·반납을 막지 않고
  Workers 로그(`observability`)에만 남는다.
- 메시지는 `parse_mode=HTML`이며 물품명·메모 같은 사용자 입력은 이스케이프한다.
- 전화번호 같은 개인정보는 단체방에 남기지 않는다 — 필요하면 앱 링크로 확인한다.

현재 1단계로 **대여 신청·회원 반납**만 보낸다. 관리자 승인·거절, 연체 다이제스트,
건의사항은 [17 백로그](17-backlog.md)의 B-09에 남아 있다.
