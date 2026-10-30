import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { createMemberAuth, migrateMembers } from "../apps/admin/src/server/members/factory";
import { MemberService } from "../apps/admin/src/server/members/service";
import { createConfigHandler } from "../apps/admin/src/server/school/client-http";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";

function school() {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  const store = new SchoolStore(db, key);
  const a = store.saveNetwork({
    name: "합성 관리 이름",
    ssid: " QA 학교망 ",
    security: "wpa2-personal",
    password: "synthetic-fixture-only",
    enabled: true,
  });
  const b = store.saveNetwork({
    name: "합성 중지망",
    ssid: "QA_DISABLED",
    security: "open",
    password: "",
    enabled: false,
  });
  const ap = store.saveAccessPoint({
    name: "합성 AP",
    networkId: a.id,
    bssid: "02:00:00:00:00:01",
    building: "비공개 검증동",
    floor: "2층",
    place: "관리자만 보는 장소",
    enabled: true,
  });
  store.saveAccessPoint({
    name: "중지 AP",
    networkId: a.id,
    bssid: "02:00:00:00:00:02",
    building: "",
    floor: "",
    place: "",
    enabled: false,
  });
  store.saveAccessPoint({
    name: "부모 중지 AP",
    networkId: b.id,
    bssid: "02:00:00:00:00:03",
    building: "",
    floor: "",
    place: "",
    enabled: true,
  });
  return { db, store, a, b, ap };
}
test("앱 설정은 활성 부모·AP와 정확한 접속정보만 포함하고 위치·관리 DTO를 제외한다", () => {
  const { db, store, a, ap } = school();
  const result = store.clientConfig();
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.version, store.snapshot().version);
  assert.deepEqual(result.networks, [
    { id: a.id, ssid: a.ssid, security: a.security, password: "synthetic-fixture-only" },
  ]);
  assert.deepEqual(result.accessPoints, [{ id: ap.id, networkId: a.id, bssid: ap.bssid }]);
  const text = JSON.stringify(result);
  for (const field of ["building", "floor", "place", "credential", "revision", "합성 관리 이름"])
    assert.equal(text.includes(field), false);
  assert.equal(JSON.stringify(store.snapshot()).includes("synthetic-fixture-only"), false);
  db.close();
});
test("OPEN과 빈 설정은 정상이며 암호 손상·누락은 부분 응답 없이 실패한다", () => {
  const { db, store, a } = school();
  const open = store.saveNetwork({
    name: "공개",
    ssid: "QA_OPEN",
    security: "open",
    password: "",
    enabled: true,
  });
  assert.equal(store.clientConfig().networks.find((n) => n.id === open.id)?.password, null);
  db.prepare("UPDATE school_network SET credential='invalid' WHERE id=?").run(a.id);
  assert.throws(() => store.clientConfig());
  db.prepare("UPDATE school_network SET credential=NULL WHERE id=?").run(a.id);
  assert.throws(() => store.clientConfig());
  db.prepare("UPDATE school_network SET enabled=0").run();
  assert.deepEqual(store.clientConfig().networks, []);
  assert.deepEqual(store.clientConfig().accessPoints, []);
  db.close();
});
async function setup() {
  const s = school(),
    db = new Database(":memory:");
  const settings = {
    baseURL: "http://localhost:3000",
    secret: randomBytes(32).toString("base64url"),
  };
  const auth = createMemberAuth(settings, db);
  await migrateMembers(auth, db, settings);
  const members = new MemberService(db, auth, settings);
  const issued = await members.issue("합성 이용자");
  const pair = await members.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  let opened = 0;
  const handle = createConfigHandler({
    getMembers: () => members,
    getSchool: () => {
      opened++;
      return s.store;
    },
    origin: () => settings.baseURL,
  });
  const request = (token?: string, extras: Record<string, string> = {}) =>
    new Request(`${settings.baseURL}/api/client/config`, {
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extras },
    });
  return {
    ...s,
    authDb: db,
    members,
    issued,
    pair,
    handle,
    request,
    opened: () => opened,
    close: () => {
      s.db.close();
      db.close();
    },
  };
}
test("인증 전에 학교 DB를 열지 않고 Cookie·갱신 토큰·회수된 접근을 거부한다", async () => {
  const f = await setup();
  assert.equal((await f.handle(f.request())).status, 401);
  assert.equal(f.opened(), 0);
  assert.equal(
    (
      await f.handle(
        f.request(undefined, { cookie: `better-auth.session_token=${f.pair.refreshToken}` }),
      )
    ).status,
    401,
  );
  assert.equal((await f.handle(f.request(f.pair.refreshToken))).status, 401);
  assert.equal(f.opened(), 0);
  const valid = await f.handle(f.request(f.pair.accessToken));
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get("cache-control") || "", /no-store/);
  assert.equal(valid.headers.has("set-cookie"), false);
  await f.members.revoke(f.issued.member.id, f.issued.member.revision);
  assert.equal((await f.handle(f.request(f.pair.accessToken))).status, 401);
  assert.equal(f.opened(), 1);
  f.close();
});
test("정확한 Origin·GET·경로·안전한 오류와 기기별 제한을 적용한다", async () => {
  const f = await setup();
  assert.equal(
    (await f.handle(f.request(f.pair.accessToken, { origin: "https://outside.invalid" }))).status,
    403,
  );
  assert.equal(
    (await f.handle(new Request("http://localhost:3000/api/client/config", { method: "POST" })))
      .status,
    405,
  );
  assert.equal(
    (await f.handle(new Request("http://localhost:3000/api/client/config/other"))).status,
    404,
  );
  for (let i = 0; i < 12; i++)
    assert.equal((await f.handle(f.request(f.pair.accessToken))).status, 200);
  const limited = await f.handle(f.request(f.pair.accessToken));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "300");
  assert.equal((await limited.text()).includes("synthetic-fixture-only"), false);
  const other = await f.members.login({
    code: f.issued.code,
    platform: "android",
    deviceName: "합성 휴대폰",
  });
  assert.equal((await f.handle(f.request(other.accessToken))).status, 200);
  f.close();
});

test("손상된 설정은 고정 오류만 반환하고 인증 거부 시 복호화하지 않는다", async () => {
  const f = await setup();
  f.db
    .prepare("UPDATE school_network SET credential='private-configuration-error' WHERE id=?")
    .run(f.a.id);
  const response = await f.handle(f.request(f.pair.accessToken));
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes("private-configuration-error"), false);
  assert.equal(body.includes("synthetic-fixture-only"), false);
  assert.equal((await f.handle(f.request())).status, 401);
  f.close();
});
