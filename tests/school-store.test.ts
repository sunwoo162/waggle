import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { CredentialCipher } from "../apps/admin/src/server/school/crypto";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";

const secret = "synthetic-only-pass";
const network = {
  name: "합성 연결",
  ssid: " QA SSID ",
  security: "wpa2-personal",
  password: secret,
  enabled: true,
};
function setup() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  return { db, key, store: new SchoolStore(db, key) };
}
test("GCM은 임의 nonce와 항목별 AAD를 사용하고 변조·잘못된 키를 거부한다", () => {
  const cipher = new CredentialCipher(randomBytes(32));
  const a = cipher.seal(secret, "network:a");
  const b = cipher.seal(secret, "network:a");
  assert.notEqual(a, b);
  assert.equal(cipher.open(a, "network:a"), secret);
  assert.throws(() => cipher.open(a, "network:b"));
  assert.throws(() => new CredentialCipher(randomBytes(32)).open(a, "network:a"));
  const parts = a.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => cipher.open(parts.join("."), "network:a"));
  assert.throws(() => cipher.open("v1.a.b.c", "network:a"));
  assert.throws(() => new CredentialCipher(Buffer.alloc(16)));
});
test("스키마는 명시적으로 준비하고 키가 바뀌면 열지 않으며 migration은 반복 가능하다", () => {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  assert.throws(() => new SchoolStore(db, key));
  migrateSchoolDatabase(db, key);
  migrateSchoolDatabase(db, key);
  assert.equal(new SchoolStore(db, key).snapshot().version, 0);
  assert.throws(() => new SchoolStore(db, randomBytes(32)));
  assert.throws(() => migrateSchoolDatabase(db, randomBytes(32)));
  db.close();
});
test("비밀번호는 DB에 암호문만 남고 모든 관리 DTO에는 원문·암호문이 없다", () => {
  const { db, key, store } = setup();
  const n = store.saveNetwork(network);
  const row = db.prepare("SELECT credential FROM school_network WHERE id = ?").get(n.id) as {
    credential: string;
  };
  assert.equal(new CredentialCipher(key).open(row.credential, `network:${n.id}`), secret);
  assert.equal(n.ssid, " QA SSID ");
  assert.equal(n.hasPassword, true);
  assert.equal(JSON.stringify(store.snapshot()).includes(secret), false);
  assert.equal(JSON.stringify(store.snapshot()).includes(row.credential), false);
  const reopened = new Database(db.serialize());
  assert.equal(new SchoolStore(reopened, key).snapshot().networks[0].id, n.id);
  reopened.close();
  db.close();
});
test("수정은 비밀번호 유지·교체·OPEN 전환을 구분하고 오래된 revision은 원자적으로 거부한다", () => {
  const { db, key, store } = setup();
  const n = store.saveNetwork(network);
  const saved = store.saveNetwork(
    { ...network, password: "", enabled: false, revision: n.revision },
    n.id,
  );
  assert.equal(saved.enabled, false);
  const before = store.snapshot();
  assert.throws(() => store.saveNetwork({ ...network, revision: n.revision }, n.id), /conflict/);
  assert.deepEqual(store.snapshot(), before);
  const next = store.saveNetwork(
    { ...network, password: "replacement-test-pass", revision: saved.revision },
    n.id,
  );
  const row = db.prepare("SELECT credential FROM school_network WHERE id=?").get(n.id) as {
    credential: string;
  };
  assert.equal(
    new CredentialCipher(key).open(row.credential, `network:${n.id}`),
    "replacement-test-pass",
  );
  const open = store.saveNetwork(
    { ...network, security: "open", password: "", revision: next.revision },
    n.id,
  );
  assert.equal(open.hasPassword, false);
  assert.throws(() =>
    store.saveNetwork({ ...network, password: "", revision: open.revision }, n.id),
  );
  assert.equal(store.snapshot().version, 4);
  db.close();
});
test("SSID는 UTF-8 바이트 길이, 보안 방식·암호·필드 형식을 검증한다", () => {
  const { db, store } = setup();
  for (const input of [
    { ...network, ssid: "가".repeat(11) },
    { ...network, ssid: "" },
    { ...network, ssid: "\ud800" },
    { ...network, password: "short" },
    { ...network, password: "한글테스트암호입니다" },
    { ...network, security: "enterprise" },
    { ...network, enabled: "true" },
    { ...network, unknown: true },
    { ...network, name: " " },
    { ...network, security: "open", password: secret },
    { ...network, security: "wpa3-personal", password: "a".repeat(64) },
  ])
    assert.throws(() => store.saveNetwork(input));
  assert.equal(store.snapshot().version, 0);
  store.saveNetwork({ ...network, ssid: "가".repeat(10) });
  store.saveNetwork({ ...network, password: "a".repeat(64) });
  assert.equal(store.snapshot().networks.length, 2);
  db.close();
});
test("AP는 전체 BSSID 중복·잘못된 식별자를 거부하고 위치 없음·비활성 부모를 보존한다", () => {
  const { db, store } = setup();
  const n = store.saveNetwork(network);
  const base = {
    networkId: n.id,
    name: "합성 AP",
    bssid: "02-00-00-00-00-01",
    building: "",
    floor: "",
    place: "",
    enabled: true,
  };
  const ap = store.saveAccessPoint(base);
  assert.equal(ap.bssid, "02:00:00:00:00:01");
  assert.equal(ap.locationRegistered, false);
  assert.equal(ap.effectiveEnabled, true);
  for (const bssid of [
    "02:00:00:00:00:01",
    "ff:ff:ff:ff:ff:ff",
    "01:00:00:00:00:01",
    "00:00:00:00:00:00",
    "invalid",
  ])
    assert.throws(() => store.saveAccessPoint({ ...base, bssid }));
  assert.throws(() =>
    store.saveAccessPoint({ ...base, bssid: "02:00:00:00:00:02", networkId: "missing" }),
  );
  const located = store.saveAccessPoint(
    { ...base, building: "검증용", floor: "2", place: "합성 장소", revision: ap.revision },
    ap.id,
  );
  assert.equal(located.locationRegistered, true);
  assert.throws(() => store.saveAccessPoint({ ...base, revision: ap.revision }, ap.id), /conflict/);
  store.saveNetwork({ ...network, password: "", enabled: false, revision: n.revision }, n.id);
  const snapshot = store.snapshot();
  assert.equal(snapshot.accessPoints.length, 1);
  assert.equal(snapshot.accessPoints[0].effectiveEnabled, false);
  assert.equal(snapshot.networks[0].apCount, 1);
  assert.equal(snapshot.version, 4);
  db.close();
});
