# 06 — 시스템 개요

서버와 클라이언트가 같은 Cloudflare Worker에서 나가는 구조, 기술 스택, 요청 흐름, 구현체.
제품 규칙은 [01 제품 규칙](01-product-spec.md), 실행·테스트는 [13 개발](13-development.md),
배포·운영은 [15 배포와 설정](15-deployment-and-config.md)을 본다.

## 한눈에

```
브라우저
  │
  ├─ /api/*  ──→ Cloudflare Worker (Hono)
  │                ├─ middleware/auth  ── requireAuth · requireAdmin
  │                ├─ routes/*         ── HTTP 경계
  │                ├─ services/*       ── SQL·도메인 로직
  │                └─ D1 (DB) · R2 (PHOTOS) · Workers AI (AI)
  │
  └─ 그 외   ──→ Static Assets (web/dist, SPA 폴백)
```

서버와 클라이언트는 같은 Worker에서 나간다. `assets.directory`가 `web/dist`를 서빙하고,
`run_worker_first`가 `/api/*`만 Worker로 먼저 보낸다. 나머지 경로는 SPA 폴백으로
`index.html`을 돌려준다.

## 기술 스택

| 계층 | 기술 | 비고 |
| --- | --- | --- |
| 호스팅 | Cloudflare Workers | 무료 플랜, Static Assets로 SPA 서빙 |
| 서버 | Hono 4 | JSON API (라우팅·미들웨어) |
| 클라이언트 | Solid 2 + TypeScript | SolidJS SPA (`web/`) |
| 빌드 | Vite | `web/dist` 산출물을 그대로 배포 |
| DB | Cloudflare D1 (SQLite) | 바인딩 호출 — 서버리스 HTTP 왕복 없음 |
| 검색 | FTS5 + Workers AI (`bge-m3`) | 키워드·부분 일치·의미 검색을 합쳐 랭킹 |
| 이미지 | Cloudflare R2 | 사진 저장·서빙 (이그레스 0원) |
| 인증 | Auth.js (`@auth/core`) | 구글 로그인 + HttpOnly 쿠키 세션 |
| 도구 | Node 24+ (npm · Vitest · TypeScript) | |

## 요청 흐름

1. **API** — `/api/*`는 `guardApiRequest`(보안 헤더·오리진 검사)를 거쳐 도메인 라우트로
   들어간다. 라우트는 `requireAuth` / `requireAdmin`으로 권한을 확인하고 서비스 함수를
   호출한다. 서비스만 SQL을 실행한다.
2. **사진** — `/api/photos/*`는 R2 키 형식을 검증하고 `requireAuth`로 최신 회원 상태를
   확인한 뒤 스트리밍한다. 물품 사진은 활성 회원 모두, 반납 사진은 본인·관리자만 볼 수 있다.
   물품 사진은 키가 업로드마다 새 UUID라 `private, max-age=86400`로 캐시하고, 반납 사진은
   `private, no-store`로 저장하지 않는다.
3. **인증** — `/api/auth/*`는 Auth.js가 전담한다. 로그인 성공 시 `members`에 upsert하고,
   JWT의 `sub`를 `members.id`로 바꾼다. 이후 모든 권한 판단은 이 ID로 한다.
4. **SPA** — 그 외 경로는 `web/dist`의 정적 파일, 없으면 `index.html`이다.
   클라이언트 라우터(`web/src/router.tsx`)가 경로·가드·리다이렉트·스크롤 복원을 맡는다.

## 구현체

| 경로 | 역할 | 상태 |
| --- | --- | --- |
| `web/` | 배포하는 SolidJS SPA | 운영 |

- Shadow DOM 대신 Tailwind v4 유틸리티 클래스를 쓴다. 토큰은 `tokens.css` 한 벌이다.
- 라우터는 `web/src/router.tsx`가 경로 매칭·가드·리다이렉트·스크롤 복원을 맡는다.
- 세션은 `/api/me` 캐시·세대 번호·401 처리 규약을 쓴다.
- 사진은 업로드 전 1600px·2MB로 축소한다. 물품 사진과 반납 사진 모두 최대 3장이다.
  물품 사진은 짧은 변 400px 썸네일도 함께 만들어 올리고, 카드·썸네일 줄·내 대여 목록은 `thumb_url`을 쓴다.
  새 업로드에서 썸네일 생성이 실패하면 사진을 추가하지 않는다 — 썸네일 없는 사진이 조용히 쌓이지 않게.
