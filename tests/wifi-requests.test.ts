import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import type { AdminAccess } from "../apps/admin/src/server/auth/access";
import {
  createWifiRequestAdminHandler,
  createWifiRequestClientHandler,
} from "../apps/admin/src/server/school/request-http";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";
import { collectionFixture } from "./helpers/collection";

const origin = "http://localhost:3000";
const room = {
  room: "합성 3층 2반",
  ssid: "QA-ROOM-2",
  security: "wpa2-personal",
  password: "synthetic-room-pass",
};

function store() {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  return { db, store: new SchoolStore(db, key) };
}

test("등록 요청은 암호화해 보관하고 운영자 승인 전에는 앱 설정에 나오지 않는다", () => {
  const { db, store: s } = store();
  assert.equal(db.pragma("user_version", { simple: true }), 3);
  assert.deepEqual(s.submitWifiRequest(room), { status: "received" });
  const raw = JSON.stringify(db.prepare("SELECT * FROM school_wifi_request").all());
  assert.equal(raw.includes(room.password), false);
  const [listed] = s.wifiRequests();
  assert.deepEqual(Object.keys(listed).sort(), ["createdAt", "id", "room", "security", "ssid"]);
  assert.equal(JSON.stringify(s.wifiRequests()).includes(room.password), false);
  assert.deepEqual(s.clientConfig().networks, []);
  const version = s.clientConfig().version;
  s.approveWifiRequest(listed.id);
  const [network] = s.clientConfig().networks;
  assert.deepEqual(
    { ssid: network.ssid, security: network.security, password: network.password },
    { ssid: room.ssid, security: room.security, password: room.password },
  );
  assert.ok(s.clientConfig().version > version);
  assert.equal(s.snapshot().networks[0].name, room.room);
  assert.deepEqual(s.wifiRequests(), []);
  db.close();
});

test("이미 등록된 SSID·잘못된 입력은 받지 않고, 거절하면 요청 원문을 지운다", () => {
  const { db, store: s } = store();
  s.saveNetwork({
    name: "기존 실",
    ssid: "QA-ROOM-1",
    security: "open",
    password: "",
    enabled: true,
  });
  assert.throws(() => s.submitWifiRequest({ ...room, ssid: "QA-ROOM-1" }), /conflict/);
  for (const bad of [
    { ...room, password: "short" },
    { ...room, security: "open" },
    { ...room, room: "" },
    { ...room, ssid: "x".repeat(33) },
    { ...room, extra: 1 },
  ])
    assert.throws(() => s.submitWifiRequest(bad), /invalid/);
  s.submitWifiRequest(room);
  const [listed] = s.wifiRequests();
  s.rejectWifiRequest(listed.id);
  assert.deepEqual(s.wifiRequests(), []);
  assert.equal(
    (db.prepare("SELECT COUNT(*) n FROM school_wifi_request").get() as { n: number }).n,
    0,
  );
  assert.throws(() => s.approveWifiRequest(listed.id), /not_found/);
  s.submitWifiRequest(room);
  s.saveNetwork({
    name: "먼저 등록",
    ssid: room.ssid,
    security: "open",
    password: "",
    enabled: true,
  });
  assert.throws(() => s.approveWifiRequest(s.wifiRequests()[0].id), /conflict/);
  db.close();
});

test("앱 요청은 기기 세션이 필요하고 기기별 하루 요청 수를 제한한다", async () => {
  const f = await collectionFixture({ publish: false });
  try {
    const handler = createWifiRequestClientHandler({
      getMembers: () => f.members,
      getSchool: () => f.school,
      origin: () => origin,
    });
    const post = (token?: string, body: unknown = room) =>
      handler(
        new Request(`${origin}/api/client/wifi-requests`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    assert.equal((await post()).status, 401);
    const issued = await f.members.issue("합성 요청자");
    const pair = await f.members.login({
      code: issued.code,
      platform: "windows",
      deviceName: "검증",
    });
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await post(pair.accessToken, { ...room, ssid: `QA-ROOM-${i + 10}` })).status,
        202,
      );
    assert.equal((await post(pair.accessToken)).status, 429);
    assert.equal(f.school.wifiRequests().length, 5);
  } finally {
    f.close();
  }
});

test("운영자 요청함은 인증·Origin을 확인하고 승인·거절한다", async () => {
  const { db, store: s } = store();
  const make = (access: AdminAccess) =>
    createWifiRequestAdminHandler({
      getAccess: async () => access,
      getStore: () => s,
      origin: () => origin,
    });
  const admin = make({ kind: "authorized", user: { id: "synthetic", name: "합성 운영자" } });
  assert.equal(
    (await make({ kind: "unauthenticated" })(new Request(`${origin}/api/admin/wifi-requests`)))
      .status,
    401,
  );
  s.submitWifiRequest(room);
  s.submitWifiRequest({ ...room, ssid: "QA-ROOM-3" });
  const list = (await (await admin(new Request(`${origin}/api/admin/wifi-requests`))).json()) as {
    requests: { id: string; ssid: string }[];
  };
  assert.equal(list.requests.length, 2);
  const act = (id: string, action: string, headers: Record<string, string> = { origin }) =>
    admin(
      new Request(`${origin}/api/admin/wifi-requests/${id}/${action}`, { method: "POST", headers }),
    );
  const first = list.requests.find((r) => r.ssid === room.ssid)!;
  assert.equal((await act(first.id, "approve", {})).status, 403);
  assert.equal((await act(first.id, "approve")).status, 200);
  const second = list.requests.find((r) => r.ssid === "QA-ROOM-3")!;
  assert.equal((await act(second.id, "reject")).status, 200);
  assert.deepEqual(s.wifiRequests(), []);
  assert.equal(s.clientConfig().networks.length, 1);
  db.close();
});
