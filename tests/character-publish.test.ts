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
  const school = new SchoolStore(db, key);
  const network = school.saveNetwork({
    name: "합성 실",
    ssid: "QA-ROOM",
    security: "open",
    password: "",
    enabled: true,
  });
  const ap = school.saveAccessPoint({
    networkId: network.id,
    name: "합성 AP",
    bssid: "02:00:00:00:00:01",
    building: "합성 건물",
    floor: "합성층",
    place: "관리자 전용 장소",
    enabled: true,
  });
  return {
    db,
    store: school.characters,
    ap,
    report: { apId: ap.id, ssid: "QA-ROOM", bssid: ap.bssid },
  };
}
async function art() {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#0bb7ae" } })
    .png()
    .toBuffer();
  return { mime: "image/png", base64: png.toString("base64") };
}

test("이름과 그림이 모두 있어야 공개 캐릭터로 앱 도감에 나온다", async () => {
  const { db, store, ap } = setup();
  assert.deepEqual(store.catalog().characters, []);
  assert.equal(store.snapshot().characters[0].published, false);
  await store.save(ap.id, { revision: 0, name: "쉿파이", description: "" });
  assert.deepEqual(store.catalog().characters, []);
  assert.equal(store.snapshot().characters[0].published, false);
  await store.save(ap.id, { revision: 1, name: "쉿파이", description: "", image: await art() });
  assert.equal(store.catalog().characters.length, 1);
  assert.equal(store.snapshot().characters[0].published, true);
  await store.save(ap.id, { revision: 2, name: "쉿파이", description: "", image: null });
  assert.deepEqual(store.catalog().characters, []);
  db.close();
});

test("공개 전 AP의 연결 보고는 거부하지 않되 수집하지 않고, 공개 뒤에는 수집한다", async () => {
  const { db, store, ap, report } = setup();
  assert.deepEqual(store.validateReports({ reports: [report] }), []);
  await store.save(ap.id, { revision: 0, name: "쉿파이", description: "", image: await art() });
  assert.deepEqual(store.validateReports({ reports: [report] }), [ap.id]);
  db.close();
});
