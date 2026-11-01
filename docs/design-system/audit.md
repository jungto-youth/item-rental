# UI 감사

디자인을 고치기 전에 **현재 상태를 목록으로 만든다**. 기억에 의존하면 빠뜨린다.
이 문서는 감사 시트의 템플릿이자, 이 앱의 초기 인벤토리다.

## 1. 촬영 기준

- 뷰포트: **390 / 768 / 1280**
- 테마: 라이트만 지원
- 상태: 기본, 로딩, 빈 상태, 오류, 검색 결과 없음, 권한 없음
- 계정: 비로그인, 일반 회원, 관리자
- 도구: Playwright 스크린샷 또는 브라우저 전체 화면 캡처

## 2. 화면 인벤토리

| 경로 | 역할 | 핵심 과업 | 확인할 상태 |
| --- | --- | --- | --- |
| `/` | 회원·관리자 | 찾기, 검색, 필터, 더보기 | 로딩·빈 목록·검색 없음·오류·더보기 |
| `/items/:id` | 회원 | 상세 확인, 수량 선택, 대여 | 로딩·오류·대여 불가·사진 없음 |
| `/items/new` | 관리자 | 물품 등록, 사진, 카테고리 | 유효성 오류·저장 중·사진 0/3 |
| `/items/:id/edit` | 관리자 | 물품 수정 | 기존 값·삭제 확인·저장 중 |
| `/login` | 방문자 | 로그인 | 오류·로딩·개발 로그인 설정 여부 |
| `/signup/profile` | 신규 회원 | 이름·연락처 등록 | 필수값 오류·저장 중 |
| `/mypage` | 회원 | 프로필 확인·수정 | 표시/수정 모드·저장 완료 |
| `/my/rentals` | 회원 | 내 대여·반납 | 빈 목록·반납 확인·오류 |
| `/admin/reservations` | 관리자 | 대여 기록·반납 처리 | 필터·빈 목록·처리 중·오류 |
| `/admin/members` | 관리자 | 역할 변경·탈퇴·정보 삭제 | 탭·검색·마지막 관리자 오류 |
| `/policy/:kind` | 공개 | 정책 열람 | 긴 문서·표·모바일 스크롤 |
| 그 외 | 공개 | 404 | 홈으로 돌아가기 |

## 3. 컴포넌트 인벤토리

| 컴포넌트 | 파일 | 변형·상태 |
| --- | --- | --- |
| 버튼 | `web/src/components/ui/button/` | primary / secondary / danger, disabled, loading, focus |
| 인풋 | `web/src/components/ui/input.ts` | text / textarea / number, required, disabled, focus |
| 칩·탭 | `web/src/components/ui/chip.ts` | sm / lg, active, disabled |
| 배지 | `web/src/components/ui/badge.ts` | 상태 텍스트 |
| 모달 | `web/src/components/ui/modal.ts` | open/close, 포커스 트랩, Esc |
| 공지 | `web/src/components/ui/notice.ts` | info / danger, action 슬롯 |
| 빈 상태 | `web/src/components/ui/empty.ts` | loading / empty / error, compact |
| 페이지 헤더 | `web/src/components/ui/page-header.ts` | 제목·부제·액션 |
| 아이콘 버튼 | `web/src/components/ui/icon-btn.ts` | 기본·hover·focus |
| 행 목록 | `web/src/components/ui/rows.ts` | 구분선·마지막 행 |
| 물품 카드 | `web/src/components/features/item/item-card.ts` | 사진 있음/없음, 상태 텍스트 |
| 물품 갤러리 | `web/src/components/features/item/item-gallery.ts` | 사진 1장/여러 장, 로드 실패 |
| 물품 탐색 | `web/src/components/features/item/item-explorer.ts` | 로딩·빈·오류·더보기·관리자 모드 |
| 대여 폼 | `web/src/components/features/item/item-rental-form.ts` | 수량·메모·저장 중·성공 |
| 사진 업로더 | `web/src/components/features/item/photo-uploader.ts` | 0/3·3/3·업로드 중·오류 |
| 카메라 | `web/src/components/features/item/camera-capture-dialog.ts` | 권한 거부·촬영·닫기 |
| 예약 행 | `web/src/components/common/reservation-row.ts` | active·배지·액션 |
| 프로필 폼 | `web/src/components/common/profile-form.ts` | 표시/수정·오류·저장 중 |
| 카테고리 입력 | `web/src/components/features/category/category-tags-input.ts` | 태그 추가/삭제·포커스 |

## 4. 상태 매트릭스

모든 인터랙티브 컴포넌트는 아래 상태를 정의한다.

| 상태 | 확인 내용 |
| --- | --- |
| default | 주변 텍스트와 구분되는가 |
| hover | 클릭 가능하다는 신호가 있는가 |
| focus-visible | 키보드 포커스가 보이는가 (2px, 대비 확보) |
| active/pressed | 눌림이 즉시 보이는가 |
| disabled | 왜 못 누르는지 알 수 있는가 |
| loading | 중복 제출을 막는가 |
| error | 무엇이 잘못됐고 어떻게 고치는지 말하는가 |
| empty | 다음 행동을 제시하는가 |
| mobile | 390px에서 잘리거나 겹치지 않는가 |

## 5. 감사 기록 템플릿

```md
### YYYY-MM-DD / 화면

- 뷰포트:
- 계정:
- 발견:
  - [ ] 간격 불일치 (8px 단위 아님)
  - [ ] 글자 크기 불일치 (14/16/20/24 밖)
  - [ ] 색 토큰 밖의 값
  - [ ] 포커스 표시 없음/약함
  - [ ] 터치 타깃 24px 미만
  - [ ] 상태(로딩·빈·오류) 누락
  - [ ] 버튼이 라벨처럼 보임
  - [ ] 인풋이 정적 텍스트처럼 보임
- 우선순위: 높음 / 보통 / 낮음
- 조치:
```

## 6. 우선순위

1. **대여 흐름**: 홈 → 상세 → 대여 신청
2. **반납 흐름**: 내 대여 / 관리자 대여 기록
3. **등록 흐름**: 물품 등록·수정
4. **계정**: 로그인·프로필
5. **나머지**: 정책·404

## 7. 감사 완료 기준

- 모든 화면이 390/768/1280에서 캡처됨
- 인터랙티브 컴포넌트의 7개 상태가 표에 기록됨
- 발견 사항에 우선순위와 조치가 붙음
- “한 번도 본 적 없는 상태”가 남아 있지 않음

## 8. 1차 감사 결과 (2026-10-29)

환경: Playwright Chromium, 390/768/1280, 고정 fixture 데이터.
기준 화면: `web/tests/visual/baseline/`

| # | 화면 | 발견 | 심각도 | 상태 |
| --- | --- | --- | --- | --- |
| 1 | 공통 | 보조 텍스트 12px가 너무 작고, nav·계정 이름이 `--ink-3`(#9c9c9c)로 대비 약 2.7:1 | 높음 | **해결** — 14px, 텍스트는 `--ink-2`(약 5.2:1)로 변경 |
| 2 | 공통 | 글자 버튼(수정·취소·목록으로·탈퇴·더보기)이 좌우 패딩 8px 때문에 주변 텍스트와 8px 어긋남 | 보통 | **해결** — 테두리 있는 버튼으로 재설계, 16px 좌우 패딩 |
| 3 | 홈 | 카드 그리드 세로 24px·가로 16px로 간격이 달랐음 | 보통 | **해결** — 8px로 통일 |
| 4 | 홈 | 사진 없는 카드가 흰 바탕과 구분되지 않아 넓은 화면에서 그리드 스캔이 약함 | 보통 | **해결** — 카드 1px 테두리 + 8px 라운드 |
| 5 | 홈 | 모바일 필터가 가로 스크롤이지만 스크롤 가능 표시가 없음 | 보통 | **해결** — 639px 이하에서 두 줄 허용 |
| 6 | 상세 | 사진이 없을 때 큰 흰 영역만 남아 페이지 밀도가 급격히 낮아짐 | 낮음 | **열림** — placeholder 축소·경계 검토 |
| 7 | 로그인 | 접근 코드 인풋이 비어 있을 때 밑줄만 보여 입력 가능성이 약함 | 보통 | **해결** — placeholder + `--border-strong` |
| 8 | 관리자 회원 | 역할 선택 칩(`회원/관리자`)이 텍스트처럼 보여 조작 가능성이 약함 | 보통 | **해결** — 네이티브 select + 밑줄로 교체 |
| 9 | 관리자 회원 | 모바일에서 행 액션이 다음 줄로 내려가 이름·역할·액션의 관계가 약해짐 | 낮음 | **열림** — 액션 묶음 정렬·간격 재확인 |
| 10 | 공통 | 입력 필드 기본 밑줄 `--border`(#e6e6e6)가 흰 배경에서 3:1 미만 | 보통 | **해결** — 흰 면 + 1px `--border` 테두리, focus `--primary` |
| 11 | 공통 | 시각 회귀 기준선·axe 검사가 없었음 | 높음 | **일부 해결** — `npm run test:visual` 추가, axe는 미도입 |

### 다음 감사 때 추가할 상태

- 빈 목록·검색 결과 없음
- 오류 배너·필드 오류
- 모달·카메라 권한 거부
- 사진 3/3·업로드 중
- 키보드 포커스 이동
- 200% 확대

> 발견 1·2·3·4·5·7·8·10은 이번에 수정했고, 기준선은 수정된 화면으로 다시 생성했다.

