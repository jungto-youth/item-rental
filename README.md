# 정토회 청년 물품 대여

정토회의 물품(대여품·소모품)을 찾아 빌리고 반납하는 사이트. 회원은 물품을 검색해 수량과
메모로 대여를 신청하고, 반납은 회원이 직접 하거나 관리자가 처리한다. Cloudflare 위에서
동작하고 운영 비용은 월 0원이다. 앱·서버 설치 없이 브라우저에서 모든 관리가 가능하다.

## 빠른 시작

```bash
npm ci
npm run dev        # API(8787) + 웹 HMR(5173) → http://localhost:5173
```

브라우저는 반드시 **5173**(Vite)으로 접속한다. 8787은 빌드 산출물을 서빙하므로 저장이
즉시 반영되지 않는다. 구글 로그인 콜백은 8787로 돌아오지만 세션 쿠키는 포트와 무관해서,
로그인 후 5173으로 다시 이동하면 된다. 자세한 실행·테스트는 [DEVELOPMENT.md](DEVELOPMENT.md).

## 구현체 지도

| 경로 | 역할 | 상태 |
| --- | --- | --- |
| `web/` | 배포하는 SolidJS SPA | 운영 |
| `server/` | Hono API · D1 · R2 · Auth.js | 운영 |
| `web-lit/` | SolidJS로 옮기기 전 Lit 앱 | deprecated (비교·시각 회귀 전용) |
| `shared/` | 서버·웹이 함께 쓰는 API 타입 계약 | 운영 |
| `migrations-d1/` | D1 스키마 마이그레이션 | 운영 |

`web-lit/`은 배포에 쓰지 않는다. 사진 파이프라인·시각 회귀 기준선이 아직 이쪽에 있어
비교용으로만 남겨 두었다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [SPEC.md](SPEC.md) | 역할·권한, 가입 정책, 회원 관리, 핵심 규칙(불변식), 화면·경로 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 기술 스택, 요청 흐름, 디렉터리 구조, 레이어 규칙 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 로컬 실행, 테스트 3계층, 빌드·검증, 문제 해결 |
| [OPERATIONS.md](OPERATIONS.md) | 배포, D1 마이그레이션, 환경 변수, 백업, 첫 관리자 |
| [DESIGN.md](DESIGN.md) | 디자인 원칙·토큰·레이아웃·컴포넌트 계약·검증 |
| [BACKLOG.md](BACKLOG.md) | 사용자 요청과 개선 백로그 |

## 라이선스

Copyright © 2026 정토회. All rights reserved.
