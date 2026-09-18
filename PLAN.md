# PLAN.md — 아키텍처 개선 및 리팩토링 로드맵

정토회 청년지부 물품 대여 사이트의 유지보수성, 타입 안정성, 코드 재사용성을 높이기 위한 구조 개선 로드맵이다.  
기존의 핵심 강점(Cloudflare Workers 기반 무료 티어 운영, `services` 계층의 SQL 소유 및 ast-grep 강제, 엄격한 디자인 시스템)을 온전히 보존하면서 점진적으로 적용한다.

---

## 1. 개선 배경 및 목표

### 현행 구조의 강점 (유지 대상)
- **명확한 백엔드 계층 분리**: `routes/` (HTTP 요청·응답) ↔ `services/` (도메인 로직·SQL).
- **엄격한 SQL 격리**: `ast-grep` 규칙(`no-sql-in-code.yml`)으로 서비스 계층 외부 SQL 침투 차단.
- **클라우드 엣지 최적화**: Cloudflare Workers + Static Assets + Neon Serverless + Workers AI + R2로 0원 운영.
- **체계적인 디자인 토큰**: [DESIGN.md](DESIGN.md) 기반의 절제된 Apple 웹 디자인 원칙.

### 주요 개선 과제
1. **프론트엔드 비대화 (Monolithic Pages)**: `web/src/components/ui/`에 `badge.ts` 1개만 존재하며, `item-detail.ts`(1,067줄), `home.ts`(676줄), `app-shell.ts`(522줄)에 모달, 폼, 사진 관리, 수백 줄의 CSS가 집중되어 있음.
2. **타입 이중 관리**: 서버 DTO와 클라이언트 응답 타입(`web/src/types.ts`)이 수동으로 분리되어 동기화 누락 위험 존재.
3. **수동 요청 검증**: 라우트 핸들러에서 문자열 트림, 정수 변환, 속성 화이트리스트 검증을 수동 if문으로 반복 작성.
4. **테스트 부족**: `reservations.service_test.ts` 1개에만 의존하며, Hono 라우트 권한 및 경계 조건 테스트 부재.

---

## 2. 목표 디렉토리 구조

```text
item-rental/
├── shared/                         # [신규] 서버·클라이언트 공용 도메인 타입 및 검증 스키마
│   ├── types.ts                    # Role, ItemKind, MemberStatus 등 코어 타입
│   └── schemas/                    # Valibot 스키마 (요청 검증 및 타입 추론 단일 진실원천)
│       ├── item.schema.ts
│       └── reservation.schema.ts
│
├── server/
│   ├── src/
│   │   ├── index.ts                # AppType export (Hono RPC 지원)
│   │   ├── routes/                 # validator 미들웨어로 슬림해진 라우트
│   │   ├── services/               # 도메인 서비스 & SQL 소유 (현행 유지)
│   │   ├── middleware/             # 인증/인가 미들웨어
│   │   └── ...
│   ├── tests/
│   │   ├── integration/            # [신규] app.request() 기반 라우트·권한 통합 테스트
│   │   └── unit/                   # services 도메인 단위 테스트
│   └── scripts/                    # 마이그레이션·시드·임베딩 스크립트
│
├── web/
│   └── src/
│       ├── api/
│       │   ├── client.ts           # Hono hc<AppType> 기반 타입 안전 클라이언트
│       │   └── ...
│       ├── components/
│       │   ├── ui/                 # [확장] 순수 디자인 시스템 컴포넌트
│       │   │   ├── badge.ts        # (기존)
│       │   │   ├── button.ts       # [신규] 주 CTA(풀필) / 고스트 / 8px 유틸 버튼
│       │   │   ├── modal.ts        # [신규] 다이얼로그 셸 (Esc/배경 닫기, 포커스 트랩)
│       │   │   ├── input.ts        # [신규] 44px 포커스 링 통일 인풋
│       │   │   └── toast.ts        # [신규] app-shell에서 분리된 토스트
│       │   │
│       │   └── features/           # [신규] 도메인 종속 컴포넌트
│       │       ├── item/
│       │       │   ├── item-card.ts            # 홈 화면 물품 카드
│       │       │   ├── item-gallery.ts         # 상세 화면 사진 캐러셀 & 뷰어
│       │       │   ├── item-rental-dialog.ts   # 대여 신청 폼 다이얼로그
│       │       │   └── item-edit-dialog.ts     # 관리자 물품 수정 모달
│       │       └── admin/
│       │           └── member-table.ts         # 회원 승인/권한 관리 테이블
│       │
│       ├── pages/                  # [다이어트] 조합 및 라우팅 연결만 담당 (150~250줄 내외)
│       │   ├── home.ts
│       │   ├── item-detail.ts
│       │   └── ...
│       └── styles/
│           ├── tokens.css          # 디자인 시스템 토큰
│           └── motion.ts
│
├── migrations/                     # DB 마이그레이션 SQL
├── wrangler.jsonc
├── deno.json
└── package.json
```

---

## 3. 단계별 실행 로드맵

### Phase 1: 프론트엔드 비대 페이지 분리 & UI 컴포넌트화 (최우선)
- **목표**: `item-detail.ts`, `home.ts`, `app-shell.ts`의 책임을 나누고 [DESIGN.md](DESIGN.md) 사양에 맞는 재사용 컴포넌트 구축.
- **작업 내용**:
  1. **디자인 시스템 UI 컴포넌트 작성**:
     - `web/src/components/ui/modal.ts`: 접근성(접근 키, 백드롭 클릭, 스크롤 잠금)을 지원하는 `<x-modal>`.
     - `web/src/components/ui/button.ts`: 풀필(CTA), 고스트, 유틸리티 8px 사각 버튼을 지원하는 `<x-button>`.
     - `web/src/components/ui/toast.ts`: `app-shell.ts` 내부의 토스트 렌더링 로직 분리.
  2. **물품 도메인 컴포넌트 분리 (`features/item/`)**:
     - `item-gallery.ts`: 사진 뷰어, 썸네일 전환, R2 1600px 프리뷰 로직 캡슐화.
     - `item-rental-dialog.ts`: 대여 수량 선택 및 메모 입력 폼.
     - `item-edit-dialog.ts`: 관리자 전용 속성 편집 및 사진 업로드/삭제 모달.
     - `item-card.ts`: `home.ts`의 물품 카드 그리드 아이템.
  3. **페이지 다이어트**:
     - `item-detail.ts`: 1,067줄 → 약 200줄 (데이터 페칭 및 하위 컴포넌트 이벤트 연결만 수행).
     - `home.ts`: 676줄 → 약 200줄.

### Phase 2: Hono RPC & End-to-End 타입 동기화
- **목표**: 백엔드와 프론트엔드 간 수동 타입 복사 제거 및 컴파일 타임 API 검증.
- **작업 내용**:
  1. `server/src/index.ts`에서 라우트 체인을 결합하여 `AppType` export:
     ```ts
     const routes = app
       .route('/api/items', itemsRoute)
       .route('/api/reservations', reservationsRoute)
       // ...
     export type AppType = typeof routes;
     ```
  2. `web/src/api/client.ts`에 `hono/client`의 `hc<AppType>` 도입:
     - URL 오타 방지 및 엔드포인트 파라미터/쿼리 자동 완성.
     - 응답 JSON 타입 자동 추론 (서버 필드명 변경 시 프론트 빌드 시점에 즉시 감지).
  3. `web/src/types.ts`의 중복 타입 정리 및 공통 도메인 타입 통일.

### Phase 3: 선언적 요청 검증 (Valibot / Zod)
- **목표**: 라우트 핸들러의 수동 유효성 검사 코드를 선언적 스키마로 교체.
- **작업 내용**:
  1. `@hono/valibot-validator` (또는 `@hono/zod-validator`) 도입:
     - Cloudflare Workers 환경 특성상 번들 크기가 극도로 작은 **Valibot** 우선 고려.
  2. 스키마 정의 (`shared/schemas/` 또는 `server/src/schemas/`):
     - `CreateItemSchema`, `UpdateItemSchema`, `CreateReservationSchema`.
  3. 라우트 리팩토링:
     - `server/src/routes/admin/items.ts`의 `normText()`, `readAttrs()` 등 수동 파싱 제거.
     - 잘못된 입력에 대해 표준화된 400 Bad Request 및 필드별 에러 자동 반환.

### Phase 4: 테스트 커버리지 확장 (Hono Integration Test)
- **목표**: 핵심 비즈니스 룰 및 권한 가드에 대한 회귀 방지 테스트 구축.
- **작업 내용**:
  1. Hono의 `app.request()`를 활용한 HTTP 통합 테스트 환경 구성 (포트 바인딩 없이 인메모리 실행).
  2. 핵심 시나리오 테스트:
     - **권한 가드**: 로그인 미인가(401), 일반 회원 관리자 라우트 접근 차단(403).
     - **마지막 관리자 보호**: 유일한 관리자의 권한 박탈 또는 비활성화 시도 시 409 에러 검증.
     - **물품 상태 및 수량 엣지 케이스**: 대여 가능 수량 초과 신청, 파손품 제외 수량 계산 검증.

---

## 4. 진행 원칙 & Non-Goals

- **무료 티어 0원 운영 유지**: 외부 유료 서비스나 Workers 번들 용량을 과도하게 늘리는 무거운 라이브러리 지양.
- **서비스 계층 SQL 소유권 유지**: ORM(Drizzle, Prisma 등) 도입 대신 현재의 파라미터화된 순수 SQL 및 서비스 계층 구조를 보존.
- **디자인 가이드 준수**: [DESIGN.md](DESIGN.md)의 원칙(단일 액센트, 44px 터치 타깃, 그림자 금지)을 컴포넌트화 과정에서 일관되게 유지.
- **점진적 적용**: 한 번의 대규모 빅뱅 리팩토링 대신, Phase 1의 프론트엔드 컴포넌트 분리부터 순차적으로 배포 및 검증.
