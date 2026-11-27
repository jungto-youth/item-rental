# 08 — 데이터 모델

D1 테이블의 축, 물품 상태 배지·소모품 규칙, 대여 상태와 재고 계산.
제품 불변식은 [05 대여 불변식](05-rental-invariants.md)에 있다.

## 테이블과 상태 배지

D1 테이블은 `migrations-d1/`이 정의한다. 주요 축은 다음과 같다.

| 영역 | 테이블 | 비고 |
| --- | --- | --- |
| 회원 | `members`, `allowed_emails` | 역할 `user`/`admin`, 소속(`affiliation`), 탈퇴·등록 정보 삭제 상태 |
| 물품 | `items`, `item_photos` | 생애주기 `active`/`retired`, 수량 상태 `total_qty`·`qty_repair`, 사진 원본·썸네일 키(`r2_key`·`thumb_r2_key`) |
| 분류 | `categories`, `item_categories` | 다대다 |
| 대여 | `reservations` | 신청 대기(`pending`)·예약(`reserved`)·대여 중·반납·취소·거절, `group_id`, 반납 예정일(`due_at`), 반납 특이사항(`return_note`), 승인·거절 처리자 |
| 반납 사진 | `reservation_photos` | 반납 시점 상태 사진(최대 3장), 회원·관리자 첨부 구분, 본인·관리자만 열람 |
| 문의 | `inquiries` | 회원 1:1 문의, 관리자 답변, `open`/`answered`, 물품 연결(`item_id`), 본문은 작성자·관리자만 열람 |
| 검색 | `items_fts` (FTS5) | 키워드 색인, 임베딩은 `items`에 저장 |

- 물품 상태 배지는 `available` · `reserved` · `unavailable` · `rented` · `repair` · `retired`
  다. `retired`는 관리자 목록에서만 보인다. `reserved`는 "예약 신청 가능", `unavailable`은
  "신청 마감"이다.
- 소모품(`consumable`)은 표시용 분류다. 대여 가능 여부는 생애주기와 수량으로만 정해지므로
  소모품도 대여·예약할 수 있다.

## 대여 상태와 재고

```
R        = total_qty - qty_repair
rented + pending <= R
신규 reserved <= R

newCap   = max(0, R - rented - pending - reserved)   // 신규가 지금 받을 수 있는 양
queueCap = max(0, R - reserved)                      // 신규가 예약할 수 있는 양

신청 N: N <= R, N <= newCap + queueCap
  now  = min(N, newCap)  -> pending
  wait = N - now         -> reserved (due_at NULL)
```

```
신청 ─┬─ pending  (재고 있음) ─┐
      └─ reserved (재고 없음) ─┴─→ 관리자 승인 → rented → returned
                                  → rejected / cancelled
```

- 한 신청은 최대 두 행(`pending`/`reserved`)이 되고 같은 `group_id`로 묶인다.
- `pending`은 신청 시 재고를 점유하고, `reserved`는 점유하지 않는다.
- 승인 가드: `pending`은 `qty + rented ≤ R`, `reserved`는 `qty + rented + pending ≤ R`.
- 자동 승격(`reserved → pending`)과 부분 배정은 v1 범위 밖이다. 승인 시점이 배정 시점이다.

## 문의

- 상태는 `open`(답변 대기) / `answered`(답변 완료) 두 가지다. 답변은 1개이고 수정할 수 있다.
- `answered`는 `answer`·`answered_by`·`answered_at`이 모두 있어야 한다(DB CHECK).
- 물품을 연결한 문의는 `item_id`로 참조하고, 물품이 삭제되면 `item_id`만 NULL이 된다.
- 본문은 작성자와 관리자만 조회한다. 타인 문의는 404로 숨긴다.
- 회원 등록 정보를 삭제하면 같은 batch에서 그 회원의 문의도 삭제한다.
- 새 문의는 관리자 텔레그램 단체방에 본문 없이 한 줄로 알린다.
