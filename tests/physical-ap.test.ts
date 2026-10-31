import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import sharp from "sharp";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";

function setup() {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  const store = new SchoolStore(db, key);
  const network = store.saveNetwork({
    name: "합성 실",
    ssid: "QA-ROOM",
    security: "open",
    password: "",
    enabled: true,
  });
  const ap = {
    networkId: network.id,
    name: "합성 듀얼 밴드 AP",
    bssid: "02:00:00:00:00:01",
    building: "합성 건물",
    floor: "합성층",
    place: "관리자 전용 장소",
    enabled: true,
  };
  return { db, key, store, network, ap };
}

test("물리 AP 하나에 BSSID 여러 개를 묶고 앱 설정에 모두 보낸다", () => {
  const { db, store, ap } = setup();
  const saved = store.saveAccessPoint({
    ...ap,
    extraBssids: ["02-00-00-00-00-02", "02:00:00:00:00:03"],
  });
  assert.deepEqual(saved.extraBssids, ["02:00:00:00:00:02", "02:00:00:00:00:03"]);
  assert.deepEqual(store.clientConfig().accessPoints, [
    {
      id: saved.id,
      networkId: ap.networkId,
      bssid: "02:00:00:00:00:01",
      bssids: ["02:00:00:00:00:01", "02:00:00:00:00:02", "02:00:00:00:00:03"],
    },
  ]);
  const replaced = store.saveAccessPoint(
    { ...ap, bssid: "02:00:00:00:00:09", extraBssids: [], revision: saved.revision },
    saved.id,
  );
  assert.deepEqual(replaced.extraBssids, []);
  assert.deepEqual(store.clientConfig().accessPoints[0].bssids, ["02:00:00:00:00:09"]);
  db.close();
});

test("다른 AP의 BSSID·잘못된 BSSID·중복·너무 많은 BSSID는 거부한다", () => {
  const { db, store, ap } = setup();
  store.saveAccessPoint({ ...ap, extraBssids: ["02:00:00:00:00:02"] });
  assert.throws(() => store.saveAccessPoint({ ...ap, bssid: "02:00:00:00:00:02" }), /conflict/);
  assert.throws(
    () =>
      store.saveAccessPoint({
        ...ap,
        bssid: "02:00:00:00:00:05",
        extraBssids: ["02:00:00:00:00:01"],
      }),
    /conflict/,
  );
  for (const extraBssids of [
    ["03:00:00:00:00:05"],
    ["02:00:00:00:00:05", "02:00:00:00:00:05"],
    ["02:00:00:00:00:04"].concat(Array.from({ length: 7 }, (_, i) => `02:00:00:00:01:0${i}`)),
    "02:00:00:00:00:05",
  ])
    assert.throws(
      () => store.saveAccessPoint({ ...ap, bssid: "02:00:00:00:00:04", extraBssids }),
      /invalid/,
    );
  db.close();
});

test("묶인 BSSID 중 어느 것으로 붙어도 같은 캐릭터를 수집한다", async () => {
  const { db, store, ap } = setup();
  const saved = store.saveAccessPoint({ ...ap, extraBssids: ["02:00:00:00:00:02"] });
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#0bb7ae" } })
    .png()
    .toBuffer();
  await store.characters.save(saved.id, {
    revision: 0,
    name: "쌍둥이",
    description: "",
    image: { mime: "image/png", base64: png.toString("base64") },
  });
  for (const bssid of ["02:00:00:00:00:01", "02:00:00:00:00:02"])
    assert.deepEqual(
      store.characters.validateReports({ reports: [{ apId: saved.id, ssid: "QA-ROOM", bssid }] }),
      [saved.id],
    );
  assert.throws(
    () =>
      store.characters.validateReports({
        reports: [{ apId: saved.id, ssid: "QA-ROOM", bssid: "02:00:00:00:00:07" }],
      }),
    /invalid/,
  );
  db.close();
});

test("v3 학교 DB는 명시적 이전으로 기존 BSSID를 그대로 묶음 표에 옮긴다", () => {
  const { db, key, store, ap } = setup();
  const saved = store.saveAccessPoint(ap);
  const before = store.snapshot();
  db.exec("DROP TABLE school_ap_bssid; PRAGMA user_version=3;");
  assert.throws(() => new SchoolStore(db, key));
  migrateSchoolDatabase(db, key);
  assert.equal(db.pragma("user_version", { simple: true }), 4);
  const reopened = new SchoolStore(db, key);
  assert.deepEqual(reopened.snapshot(), { ...before, version: before.version + 1 });
  assert.deepEqual(reopened.clientConfig().accessPoints[0].bssids, [saved.bssid]);
  db.close();
});
