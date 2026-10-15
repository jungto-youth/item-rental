# menu_tree.md

관리자 메뉴바(admin-nav)는 삭제됐다. 관리자 이동 수단은:
- 계정 메뉴: 물품 등록(`/items/new`) · 대여 관리(`/admin/reservations`) · 회원 관리(`/admin/members`)
- 통합 목록(`/`) 내 등록 버튼·행별 수정 버튼 (관리자 세션에만 보임)

```
물품 탐색 (통합)                 /           — 활성 회원 목록 + 관리자 확장(칩·수정·대여자 패널)
물품 상세                        /items/:id  — 활성 회원 + 관리자 수정 버튼
물품 등록                        /items/new            (requireAdmin)
물품 수정                        /items/:id/edit       (requireAdmin)
대여 관리                        /admin/reservations   (requireAdmin)
회원 관리 (+허용 이메일 탭)      /admin/members        (requireAdmin)
```

회원 관리: 활성 회원은 탈퇴 처리, 탈퇴 회원은 대여 중인 물품이 없을 때 등록 정보를 삭제할 수 있다.
등록 정보 삭제는 개인정보를 익명화하며 완료된 대여·반납 처리 이력을 보존한다.

삭제된 라우트: `/admin`(대시보드→`/` 흡수), `/admin/items`(목록→`/` 흡수),
`/admin/categories`(등록 폼 태그 에디터로 흡수 — 이름변경·삭제 기능 제거),
`/admin/allowed-emails`(`/admin/members` 탭으로 흡수).
