import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { encode } from "@auth/core/jwt";
import type { Hono } from "hono";
import type { Bindings, Variables } from "../src/types.ts";
import productionApp from "../src/index.ts";

// Synthetic credentials and in-memory storage; never used by a running server.
export const TEST_CODE = "development-fixture-code-0123456789abcdef";
export const TEST_ORIGIN = "http://localhost:8787";
export const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), c => c.charCodeAt(0));

export function httpFixture(app: Hono<{ Bindings: Bindings; Variables: Variables }> = productionApp) {
  const db = new DatabaseSync(":memory:");
  for (const name of ["0001_baseline.sql", "0002_item_photos_item_id.sql", "0003_member_registration_deleted.sql"]) {
    db.exec(readFileSync(new URL(`../../migrations-d1/${name}`, import.meta.url), "utf8"));
  }
  const statements: string[] = [];
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  let photoReads = 0;
  const env = {
    AUTH_SECRET: "http-fixture-secret-not-used-outside-tests",
    DEV_LOGIN_CODE: TEST_CODE,
    DB: {
      prepare(sql: string) {
        return { bind(...params: SQLInputValue[]) {
          return { all: async () => {
            statements.push(sql);
            return { results: db.prepare(sql).all(...params), success: true };
          } };
        } };
      },
      async batch(stmts: { all: () => Promise<unknown> }[]) {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const stmt of stmts) results.push(await stmt.all());
          db.exec("COMMIT"); return results;
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    },
    PHOTOS: {
      async put(key: string, body: BodyInit, options: { httpMetadata: { contentType: string } }) {
        objects.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), type: options.httpMetadata.contentType });
      },
      async get(key: string) {
        photoReads++;
        const object = objects.get(key) ?? (key === "items/1/fixture.png" ? { bytes: PNG, type: "image/png" } : null);
        return object ? {
          body: object.bytes, httpMetadata: { contentType: object.type }, httpEtag: '"fixture"',
          writeHttpMetadata(headers: Headers) { headers.set("content-type", object.type); },
        } : null;
      },
      async delete(key: string) { objects.delete(key); },
    },
  } as unknown as Bindings & { DEV_LOGIN_CODE?: string };
  const request = (path: string, init?: RequestInit, base = TEST_ORIGIN) => app.fetch(new Request(base + path, init), env);
  async function member(id: string, role: "user" | "admin" = "user", inactive = false) {
    db.prepare("INSERT INTO members (id, email, name, phone, role, deactivated_at) VALUES (?1, ?2, ?1, '010-0000-0000', ?3, ?4)")
      .run(id, `${id}@jungto.org`, role, inactive ? "2026-01-01" : null);
    const token = await encode({ secret: env.AUTH_SECRET, salt: "authjs.session-token", token: { sub: id } });
    return `authjs.session-token=${token}`;
  }
  return { db, env, request, member, cookie: member, statements, objects, get photoReads() { return photoReads; } };
}
