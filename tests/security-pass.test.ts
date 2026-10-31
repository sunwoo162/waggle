import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import nextConfig from "../apps/admin/next.config";
import type { AdminAccess } from "../apps/admin/src/server/auth/access";
import { createSchoolHandler } from "../apps/admin/src/server/school/http";
import {
  migrateSchoolDatabase,
  rotateSchoolKey,
  SchoolStore,
} from "../apps/admin/src/server/school/store";

const origin = "http://localhost:3000";
function setup() {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  return { db, key, store: new SchoolStore(db, key) };
}

test("키 교체는 모든 암호문을 새 키로 다시 암호화하고 이전 키로는 열리지 않게 한다", () => {
  const { db, key, store } = setup();
  store.saveNetwork({
    name: "실",
    ssid: "QA-1",
    security: "wpa2-personal",
    password: "synthetic-pass-1",
    enabled: true,
  });
  store.submitWifiRequest({
    room: "요청 실",
    ssid: "QA-2",
    security: "wpa3-personal",
    password: "synthetic-pass-2",
  });
  const before = store.clientConfig();
  const next = randomBytes(32);
  assert.throws(() => rotateSchoolKey(db, randomBytes(32), next));
  rotateSchoolKey(db, key, next);
  assert.throws(() => new SchoolStore(db, key));
  const rotated = new SchoolStore(db, next);
  assert.deepEqual(rotated.clientConfig(), before);
  rotated.approveWifiRequest(rotated.wifiRequests()[0].id);
  assert.equal(
    rotated.clientConfig().networks.find((n) => n.ssid === "QA-2")?.password,
    "synthetic-pass-2",
  );
  db.close();
});

test("운영자 작업은 비밀값 없이 누가·언제·무엇을 했는지 기록된다", async () => {
  const { db, store } = setup();
  const handler = createSchoolHandler({
    getAccess: async () => ({
      kind: "authorized",
      user: { id: "operator-1", name: "합성 운영자" },
      signedInAt: Date.now(),
    }),
    getStore: () => store,
    origin: () => origin,
  });
  const response = await handler(
    new Request(`${origin}/api/admin/school/networks`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "실",
        ssid: "QA-1",
        security: "wpa2-personal",
        password: "synthetic-audit-pass",
        enabled: true,
      }),
    }),
  );
  assert.equal(response.status, 201);
  const [entry] = store.auditLog();
  assert.equal(entry.operator, "operator-1");
  assert.equal(entry.action, "network.save");
  assert.ok(entry.target);
  assert.equal(JSON.stringify(store.auditLog()).includes("synthetic-audit-pass"), false);
  db.close();
});

test("비밀번호가 담긴 설정 변경은 최근 로그인이 필요하다", async () => {
  const { db, store } = setup();
  const stale: AdminAccess = {
    kind: "authorized",
    user: { id: "operator-1", name: "합성 운영자" },
    signedInAt: Date.now() - 16 * 60 * 1000,
  };
  const handler = createSchoolHandler({
    getAccess: async () => stale,
    getStore: () => store,
    origin: () => origin,
  });
  const response = await handler(
    new Request(`${origin}/api/admin/school/networks`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "실",
        ssid: "QA-1",
        security: "open",
        password: "",
        enabled: true,
      }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { code: string }).code, "reauth");
  assert.equal(store.snapshot().networks.length, 0);
  assert.equal((await handler(new Request(`${origin}/api/admin/school`))).status, 200);
  db.close();
});

test("모든 페이지는 다른 사이트에 끼워 넣을 수 없고 기본 보안 헤더를 가진다", async () => {
  const rules = await nextConfig.headers?.();
  const all = rules?.find((r) => r.source === "/:path*");
  const headers = Object.fromEntries(
    (all?.headers || []).map((h) => [h.key.toLowerCase(), h.value]),
  );
  assert.equal(headers["x-frame-options"], "DENY");
  assert.match(headers["content-security-policy"] || "", /frame-ancestors 'none'/);
  assert.match(headers["content-security-policy"] || "", /object-src 'none'/);
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "same-origin");
});
