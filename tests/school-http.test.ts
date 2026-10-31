import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import type { AdminAccess } from "../apps/admin/src/server/auth/access";
import { createSchoolHandler } from "../apps/admin/src/server/school/http";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";

const origin = "http://localhost:3000";
const base = `${origin}/api/admin/school`;
const payload = {
  name: "합성 연결",
  ssid: "QA",
  security: "wpa2-personal",
  password: "synthetic-test-pass",
  enabled: true,
};
function setup(
  access: AdminAccess = {
    kind: "authorized",
    user: { id: "synthetic", name: "합성 운영자" },
    signedInAt: Date.now(),
  },
) {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  const store = new SchoolStore(db, key);
  const handler = createSchoolHandler({
    getAccess: async () => access,
    getStore: () => store,
    origin: () => origin,
  });
  return { db, store, handler };
}
function write(path: string, body: unknown, extra: Record<string, string> = {}, method = "POST") {
  return new Request(base + path, {
    method,
    headers: { origin, "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}
test("모든 관리 경로는 인증을 먼저 검사하고 실패 시 저장소에 접근하지 않는다", async () => {
  for (const [kind, status] of [
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["unconfigured", 503],
    ["unavailable", 503],
  ] as const) {
    let opened = false;
    const handler = createSchoolHandler({
      getAccess: async () => ({ kind }),
      getStore: () => {
        opened = true;
        throw new Error("private raw detail");
      },
      origin: () => origin,
    });
    for (const request of [new Request(base), write("/networks", payload)]) {
      const response = await handler(request);
      assert.equal(response.status, status);
      assert.equal(opened, false);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      assert.equal((await response.text()).includes("private raw detail"), false);
    }
  }
});
test("쓰기 요청은 정확한 Origin·JSON과 실제 본문 크기를 검사한다", async () => {
  const { db, store, handler } = setup();
  assert.equal(
    (await handler(write("/networks", payload, { origin: "https://outside.invalid" }))).status,
    403,
  );
  const noOrigin = write("/networks", payload);
  noOrigin.headers.delete("origin");
  assert.equal((await handler(noOrigin)).status, 403);
  assert.equal(
    (await handler(write("/networks", payload, { "content-type": "text/plain" }))).status,
    415,
  );
  assert.equal(
    (
      await handler(
        new Request(`${base}/networks`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: "{",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        write("/networks", { ...payload, name: "x".repeat(17000) }, { "content-length": "1" }),
      )
    ).status,
    413,
  );
  assert.equal(store.snapshot().version, 0);
  db.close();
});
test("실제 저장소로 등록·수정·비활성화하고 응답은 암호·암호문을 노출하지 않는다", async () => {
  const { db, handler } = setup();
  const created = await handler(write("/networks", payload));
  assert.equal(created.status, 201);
  const snapshot = await created.json();
  const n = snapshot.networks[0];
  assert.equal(JSON.stringify(snapshot).includes(payload.password), false);
  assert.deepEqual(
    Object.keys(n).sort(),
    [
      "id",
      "name",
      "ssid",
      "security",
      "enabled",
      "revision",
      "updatedAt",
      "hasPassword",
      "apCount",
    ].sort(),
  );
  const edited = await handler(
    write(
      `/networks/${n.id}`,
      { ...payload, password: "", enabled: false, revision: n.revision },
      {},
      "PATCH",
    ),
  );
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).networks[0].enabled, false);
  const stale = await handler(
    write(`/networks/${n.id}`, { ...payload, password: "", revision: n.revision }, {}, "PATCH"),
  );
  assert.equal(stale.status, 409);
  assert.equal((await handler(new Request(base))).status, 200);
  db.close();
});
test("AP 경로·잘못된 메서드·저장소 오류와 검증 오류를 안전하게 처리한다", async () => {
  const { db, handler, store } = setup();
  const n = store.saveNetwork(payload);
  assert.equal(
    (
      await handler(
        write("/access-points", {
          networkId: n.id,
          name: "합성 AP",
          bssid: "02:00:00:00:00:01",
          building: "",
          floor: "",
          place: "",
          enabled: true,
        }),
      )
    ).status,
    201,
  );
  const wrong = await handler(new Request(`${base}/networks`, { method: "GET" }));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("allow"), "POST");
  assert.equal((await handler(write("/unknown", {}))).status, 404);
  assert.equal((await handler(write("/networks", { ...payload, ssid: "" }))).status, 400);
  db.close();
  const failed = createSchoolHandler({
    getAccess: async () => ({
      kind: "authorized",
      user: { id: "a", name: "b" },
      signedInAt: Date.now(),
    }),
    getStore: () => {
      throw new Error("private raw detail");
    },
    origin: () => origin,
  });
  const response = await failed(new Request(base));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("private raw detail"), false);
});
