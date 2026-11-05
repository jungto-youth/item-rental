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
로그인 후 5173으로 다시 이동하면 된다. 자세한 실행·테스트는
[docs/13-development.md](docs/13-development.md).

## 구현체 지도

| 경로 | 역할 | 상태 |
| --- | --- | --- |
| `web/` | 배포하는 SolidJS SPA | 운영 |
| `server/` | Hono API · D1 · R2 · Auth.js | 운영 |
| `shared/` | 서버·웹이 함께 쓰는 API 타입 계약 | 운영 |
| `migrations-d1/` | D1 스키마 마이그레이션 | 운영 |

## 문서

`docs/`에 주제별로 나눠 두었다. 번호 순서대로 읽으면
제품 규칙 → 구조 → 디자인 → 개발·운영 → 백로그 흐름이다.

### 제품

| 문서 | 내용 |
| --- | --- |
| [01 제품 규칙](docs/01-product-spec.md) | 역할·권한, 현재 범위 밖 |
| [02 가입과 로그인](docs/02-signup-and-login.md) | 허용 계정, 최초 프로필, 거부 사유 |
| [03 화면과 경로](docs/03-screens-and-routes.md) | 화면 목록, 접근 권한, 이동 규칙 |
| [04 회원 관리](docs/04-member-management.md) | 탈퇴, 등록 정보 삭제, 역할·허용 목록 |
| [05 대여 불변식](docs/05-rental-invariants.md) | 재고·승인·취소·반납 계약 |

### 구조

| 문서 | 내용 |
| --- | --- |
| [06 시스템 개요](docs/06-system-overview.md) | 아키텍처, 기술 스택, 요청 흐름, 구현체 |
| [07 서버와 클라이언트](docs/07-server-and-client.md) | 디렉터리, 레이어 규칙 |
| [08 데이터 모델](docs/08-data-model.md) | D1 테이블, 상태 배지, 대여 상태·재고 계산 |
| [09 검색](docs/09-search.md) | FTS5·LIKE·임베딩을 RRF로 합치는 검색 |

### 디자인

| 문서 | 내용 |
| --- | --- |
| [10 디자인 시스템](docs/10-design-system.md) | 원칙, 토큰, 레이아웃 |
| [11 UI 컴포넌트](docs/11-ui-components.md) | 컴포넌트 계약, 핵심 규격, 스타일 작성 |
| [12 디자인 검증](docs/12-design-validation.md) | 검증 명령, 접근성, 남은 작업, 참고 |

### 개발·운영

| 문서 | 내용 |
| --- | --- |
| [13 개발](docs/13-development.md) | 로컬 실행, 타입 검사·빌드, 문제 해결 |
| [14 테스트](docs/14-testing.md) | 단위·통합·브라우저 3계층 테스트 |
| [15 배포와 설정](docs/15-deployment-and-config.md) | 배포, 환경 변수·시크릿 |
| [16 데이터베이스 운영](docs/16-database-operations.md) | 마이그레이션, 시드·시트, 백업, 관리자, 모니터링 |

### 백로그

| 문서 | 내용 |
| --- | --- |
| [17 백로그](docs/17-backlog.md) | 사용자 요청과 처리 상태 |

운영 중에만 쓰는 시트 반영 리포트(`data/sheet-import/report.md`)는 스크립트 생성물이라
데이터 옆에 그대로 둔다. 생성·확인 방법은 [16 데이터베이스 운영](docs/16-database-operations.md)에 있다.

## 라이선스

Copyright © 2026 정토회. All rights reserved.
