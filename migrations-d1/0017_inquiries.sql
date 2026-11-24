-- 0017 — 문의
--
-- 회원이 남긴 문의와 관리자 답변. 본문은 작성자·관리자만 조회한다.
-- 회원 등록 정보 삭제 시 members.service 가 같은 batch 에서 이 회원의 문의를 지운다.
-- 물품이 삭제돼도 문의 이력은 남기기 위해 item_id 는 ON DELETE SET NULL 이다.
CREATE TABLE inquiries (
  id          INTEGER PRIMARY KEY,
  member_id   TEXT NOT NULL REFERENCES members (id),
  item_id     INTEGER REFERENCES items (id) ON DELETE SET NULL,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  answer      TEXT CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 2000),
  answered_by TEXT REFERENCES members (id),
  answered_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    (status = 'open'
      AND answer IS NULL AND answered_by IS NULL AND answered_at IS NULL)
    OR
    (status = 'answered'
      AND answer IS NOT NULL AND answered_by IS NOT NULL AND answered_at IS NOT NULL)
  )
);

CREATE INDEX inquiries_member_created ON inquiries (member_id, created_at DESC);
CREATE INDEX inquiries_status_created ON inquiries (status, created_at DESC);
