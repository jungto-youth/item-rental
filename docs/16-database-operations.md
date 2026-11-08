# 16 — 데이터베이스 운영

D1 마이그레이션, 시드·시트 반영, 백업, 첫 관리자, 확인·모니터링.

## D1 마이그레이션

스키마는 `migrations-d1/`이 소유한다. **기존 파일을 고치지 않고 새 번호를 추가한다.**

```bash
# 로컬
npx wrangler d1 migrations apply item-rental-db --local

# 운영
npx wrangler d1 migrations apply item-rental-db --remote
```

현재 기준선 이후 변경:

| 파일 | 내용 |
| --- | --- |
| `0001_baseline.sql` | D1 최종 스키마 기준선 |
| `0002_item_photos_item_id.sql` | 사진-물품 연결 |
| `0003_member_registration_deleted.sql` | 등록 정보 삭제 상태 |
| `0004_rental_history.sql` | 대여 이력 |
| `0005_item_quantity_state.sql` | 수량 상태 분리 (`total_qty`·`qty_repair`) |
| `0006_inventory_adjustments.sql` | 재고 수량 조정 이력 |
| `0007_reservation_approval.sql` | 대여 승인 상태·소속 스냅샷 |
| `0008_drop_inventory_adjustments.sql` | 재고 수량 조정 이력 기능 제거 |
| `0009_reservation_photos.sql` | 반납 상태 사진 (`reservation_photos`) |
| `0013_item_photo_thumbnails.sql` | 물품 사진 썸네일 키 (`item_photos.thumb_r2_key`) — 기존 사진은 배포 후 1회 채웠고, 이후 업로드는 항상 썸네일을 함께 만든다 |
| `0014_reservation_return_note.sql` | 반납 특이사항 (`reservations.return_note`) — 코드 배포 전에 적용 |

로컬과 운영은 자동으로 다른 DB를 쓴다(로컬은 로컬 SQLite 파일, 운영은 원격 D1).

## 시드 · 시트 반영

```bash
npm run db:seed                                  # 시드 SQL 생성
npx wrangler d1 execute item-rental-db --local --file=server/scripts/out/seed.sql

npm run db:import-items                          # 시트 물품 일괄 반영 SQL 생성
```

- 생성물은 `server/scripts/out/`에 남고 커밋하지 않는다.
- 시트 원장과 반영 리포트는 `data/sheet-import/`에 있다. `report.md`는 스크립트 생성물이라
  직접 고치지 않는다.
- `data/sheet-import/build.py --fetch` 는 **서비스 계정** 키로 시트를 읽는다.
  키 경로는 `GOOGLE_SA_KEY` 환경변수, 없으면 `~/.config/item-rental/google-sa.json`.
  키의 `client_email` 을 시트에 뷰어로 공유해야 한다. 키 파일은 커밋하지 않는다.

DB에 직접 넣은 물품은 검색용 임베딩이 없다. 관리자 세션으로
`POST /api/admin/reembed-all`을 끝날 때까지 반복 호출해 채운다.

## 백업

D1 Time Travel로 최근 30일 내 시점 복구가 가능하다. 별도 백업 스크립트는 두지 않는다.

## 첫 관리자

첫 관리자는 DB에서 직접 지정한다. 가입은 `user`로 되고, 가입만으로 관리자가 되지 않는다.

```sql
UPDATE members SET role = 'admin' WHERE email = '...';
```

이후 관리자 지정은 `/admin/members`에서 한다. 마지막 활성 관리자는 해임·탈퇴할 수 없다.

## 확인 · 모니터링

- 헬스체크: `GET /api/health` → `{ "ok": true }`
- Workers 로그 영속화가 켜져 있다(`observability`). 500·임베딩 실패는 Cloudflare
  대시보드에서 확인한다.
- 장애 시 확인 순서: `/api/health` → Workers 로그 → D1 마이그레이션 적용 여부 →
  구글 OAuth 설정(`AUTH_GOOGLE_*`, 콜백 URL).
