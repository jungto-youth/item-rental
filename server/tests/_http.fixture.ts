import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encode } from "@auth/core/jwt";
import app from "../src/index.ts";
import type { Bindings } from "../src/types.ts";

export const TEST_ORIGIN = "http://localhost:8787";
export function httpFixture() {
  const db = new DatabaseSync(":memory:");
  for (const name of ["0001_baseline.sql", "0002_item_photos_item_id.sql", "0003_member_registration_deleted.sql"]) {
    db.exec(readFileSync(fileURLToPath(new URL(`../../migrations-d1/${name}`, import.meta.url).href), "utf8"));
  }
  let photoReads = 0;
  const env = {
    AUTH_SECRET: "member-access-fixture-secret-not-for-a-running-server",
    DB: {
      prepare(sql: string) {
        return { bind(...values: SQLInputValue[]) {
          return { all: async () => ({ results: db.prepare(sql).all(...values), success: true }) };
        } };
      },
      async batch(statements: { all: () => Promise<unknown> }[]) {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.all());
          db.exec("COMMIT"); return results;
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    },
    PHOTOS: { async get() {
      photoReads++;
      return {
        body: new Uint8Array([1, 2, 3]), httpEtag: '"fixture"',
        writeHttpMetadata(headers: Headers) { headers.set("content-type", "image/png"); },
      };
    } },
  } as unknown as Bindings;
  const request = (path: string, init?: RequestInit) => app.fetch(new Request(TEST_ORIGIN + path, init), env);
  async function member(id: string, role: "admin" | "user" = "user", inactive = false) {
    db.prepare("INSERT INTO members (id, email, name, role, deactivated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .run(id, `${id}@jungto.org`, id, role, inactive ? "2026-01-01" : null);
    const token = await encode({ secret: env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: id } });
    return `authjs.session-token=${token}`;
  }
  return { db, env, request, member, get photoReads() { return photoReads; } };
}
