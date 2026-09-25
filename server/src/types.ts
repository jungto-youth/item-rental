// 공유 타입 — Hono 앱 전역 바인딩/변수
export type Bindings = {
  // D1 (SQLite) — PLAN_D1_이관.md (Neon 이관 완료, Phase 6.5)
  DB: D1Database;
  // Auth.js — 배포: `wrangler secret put` / 로컬: .dev.vars
  AUTH_SECRET: string;
  AUTH_GOOGLE_ID: string;
  AUTH_GOOGLE_SECRET: string;
  // @jungto.org 외 로그인을 허용하는 예외 이메일 (콤마 구분, 선택) — 운영진 개인 계정 등
  AUTH_ALLOWED_EMAILS?: string;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  // Workers AI — 물품 임베딩 생성 (의미 검색)
  AI: Ai;
};

// 역할 2단계 (v3.2) — admin(관리자) > user(회원)
export type Role = "user" | "admin";

// 미들웨어가 세팅하는 세션 사용자
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null; // nullable — 최초 로그인 후 프로필 입력에서 채움
  role: Role;
  deactivated_at: string | null; // null = 활성, 값 있으면 탈퇴(소프트 삭제) 시각
};

export type Variables = {
  user: SessionUser | null;
};
