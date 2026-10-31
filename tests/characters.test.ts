import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import sharp from "sharp";
import { migrateSchoolDatabase, SchoolStore } from "../apps/admin/src/server/school/store";

function setup() {
  const db = new Database(":memory:");
  const key = randomBytes(32);
  migrateSchoolDatabase(db, key);
  const school = new SchoolStore(db, key);
  const n = school.saveNetwork({
    name: "합성 네트워크",
    ssid: " QA SSID ",
    security: "open",
    password: "",
    enabled: true,
  });
  const ap = school.saveAccessPoint({
    networkId: n.id,
    name: "합성 AP",
    bssid: "02:00:00:00:00:01",
    building: "관리자 전용 건물",
    floor: "합성층",
    place: "관리자 전용 장소",
    enabled: true,
  });
  return { db, key, school, n, ap, store: school.characters };
}
async function image() {
  const input = await sharp({
    create: { width: 24, height: 24, channels: 4, background: "#0bb7ae" },
  })
    .png()
    .withExif({ IFD0: { Artist: "synthetic-metadata" } })
    .toBuffer();
  return { mime: "image/png", base64: input.toString("base64") };
}
test("v1 학교 DB는 명시적으로 이전하고 키·AP·암호문을 보존한다", () => {
  const { db, key, ap, school, n } = setup();
  school.saveNetwork(
    {
      name: n.name,
      ssid: n.ssid,
      security: "wpa2-personal",
      password: "synthetic-only-pass",
      enabled: true,
      revision: n.revision,
    },
    n.id,
  );
  const credential = db.prepare("SELECT credential FROM school_network WHERE id=?").get(n.id);
  const before = school.snapshot();
  db.exec(
    "DROP TABLE IF EXISTS school_ap_bssid; DROP TABLE IF EXISTS school_wifi_request; DROP TABLE IF EXISTS school_character; DROP TABLE IF EXISTS school_art; PRAGMA user_version=1;",
  );
  assert.throws(() => new SchoolStore(db, key));
  assert.throws(() => migrateSchoolDatabase(db, randomBytes(32)));
  assert.equal(db.pragma("user_version", { simple: true }), 1);
  migrateSchoolDatabase(db, key);
  migrateSchoolDatabase(db, key);
  assert.equal(db.pragma("user_version", { simple: true }), 4);
  const reopened = new SchoolStore(db, key);
  assert.deepEqual(reopened.snapshot(), { ...before, version: before.version + 1 });
  assert.deepEqual(
    db.prepare("SELECT credential FROM school_network WHERE id=?").get(n.id),
    credential,
  );
  assert.equal(reopened.characters.snapshot().characters[0].id, ap.id);
  db.close();
});
test("등록 AP마다 캐릭터 하나이며 앱 도감에는 설치 장소·SSID·BSSID를 포함하지 않는다", async () => {
  const { db, store, ap } = setup();
  assert.equal(store.catalog().characters.length, 0);
  const current = store.snapshot().characters[0];
  assert.equal(current.revision, 0);
  assert.equal(current.name, "이름 없는 친구");
  await store.save(ap.id, {
    revision: 0,
    name: "쉿파이",
    description: "작은 패킷을 품은 친구",
    image: await image(),
  });
  const catalog = store.catalog();
  assert.deepEqual(Object.keys(catalog.characters[0]).sort(), [
    "description",
    "id",
    "imagePath",
    "name",
  ]);
  assert.equal(catalog.characters[0].name, "쉿파이");
  for (const value of [ap.building, ap.place, ap.bssid, " QA SSID "])
    assert.equal(JSON.stringify(catalog).includes(value), false);
  db.close();
});
test("캐릭터 저장은 버전 충돌·알 수 없는 AP·잘못된 항목을 원자적으로 거부한다", async () => {
  const { db, store, ap } = setup();
  await store.save(ap.id, { revision: 0, name: "첫 친구", description: "합성 소개" });
  const before = store.snapshot();
  const incoming = await image();
  await assert.rejects(
    () => store.save(ap.id, { revision: 0, name: "덮어쓰기", description: "", image: incoming }),
    /conflict/,
  );
  await assert.rejects(
    () => store.save(randomUUID(), { revision: 0, name: "친구", description: "" }),
    /not_found/,
  );
  await assert.rejects(
    () => store.save(ap.id, { revision: 1, name: " ", description: "" }),
    /invalid/,
  );
  await assert.rejects(
    () => store.save(ap.id, { revision: 1, name: "친구", description: "", building: "비허용" }),
    /invalid/,
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM school_art").get() as { count: number }).count,
    0,
  );
  db.close();
});
test("이미지 처리 중 동시에 편집해도 하나만 저장하며 자산·텍스트는 함께 반영한다", async () => {
  const { db, store, ap } = setup();
  const incoming = await image();
  const results = await Promise.allSettled([
    store.save(ap.id, { revision: 0, name: "첫 번째", description: "", image: incoming }),
    store.save(ap.id, { revision: 0, name: "두 번째", description: "", image: incoming }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(store.snapshot().characters[0].revision, 1);
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM school_art").get() as { count: number }).count,
    1,
  );
  db.close();
});
test("PNG를 메타데이터 없는 WebP로 저장하고 참조 없는 이전 자산을 정리한다", async () => {
  const { db, store, ap } = setup();
  await store.save(ap.id, {
    revision: 0,
    name: "쉿파이",
    description: "합성 소개",
    image: await image(),
  });
  const saved = store.catalog().characters[0];
  assert.ok(saved.imagePath);
  assert.match(saved.imagePath, /^\/api\/art\/[a-f0-9]{64}$/);
  const hash = saved.imagePath.slice("/api/art/".length);
  const bytes = store.asset(hash);
  assert.ok(bytes);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  const version = store.catalog().version;
  await store.save(ap.id, { revision: 1, name: "쉿파이", description: "소개 변경" });
  assert.equal(store.catalog().characters[0].imagePath, saved.imagePath);
  assert.ok(store.catalog().version > version);
  await store.save(ap.id, { revision: 2, name: "쉿파이", description: "", image: null });
  assert.equal(store.snapshot().characters[0].imagePath, null);
  assert.equal(store.catalog().characters.length, 0);
  assert.equal(store.asset(hash), null);
  db.close();
});
test("형식 위장·큰 픽셀·큰 본문·다중 프레임·잘못된 base64 이미지는 저장하지 않는다", async () => {
  const { db, store, ap } = setup();
  const png = await image();
  const large = await sharp({
    create: { width: 2049, height: 2049, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const frame = Buffer.from(png.base64, "base64");
  const second = await sharp({
    create: { width: 24, height: 24, channels: 4, background: "#fc6589" },
  })
    .png()
    .toBuffer();
  const animated = await sharp([frame, second], { join: { animated: true } })
    .webp()
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  for (const invalid of [
    { mime: "image/svg+xml", base64: Buffer.from("<svg/>").toString("base64") },
    { mime: "image/jpeg", base64: png.base64 },
    { mime: "image/png", base64: large.toString("base64") },
    { mime: "image/webp", base64: animated.toString("base64") },
    { mime: "image/png", base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64") },
    { mime: "image/png", base64: `${png.base64}\n` },
  ])
    await assert.rejects(
      () => store.save(ap.id, { revision: 0, name: "친구", description: "", image: invalid }),
      /invalid/,
    );
  assert.equal(store.snapshot().characters[0].revision, 0);
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM school_art").get() as { count: number }).count,
    0,
  );
  db.close();
});
test("연결 보고는 현재 활성 AP·SSID·BSSID를 모두 확인하고 추가 항목·일괄 부분 성공을 거부한다", async () => {
  const { db, store, ap, school, n } = setup();
  const report = { apId: ap.id, ssid: n.ssid, bssid: ap.bssid };
  await store.save(ap.id, { revision: 0, name: "쉿파이", description: "", image: await image() });
  assert.deepEqual(store.validateReports({ reports: [report, report] }), [ap.id]);
  for (const input of [
    { reports: [{ ...report, ssid: "다른 망" }] },
    { reports: [report, { ...report, apId: randomUUID() }] },
    { reports: [{ ...report, observedAt: Date.now() }] },
    { reports: Array.from({ length: 101 }, () => report) },
    { reports: [report], memberId: randomUUID() },
  ])
    assert.throws(() => store.validateReports(input), /invalid/);
  school.saveNetwork(
    {
      name: n.name,
      ssid: n.ssid,
      security: n.security,
      password: "",
      enabled: false,
      revision: n.revision,
    },
    n.id,
  );
  assert.deepEqual(store.catalog().characters, []);
  assert.throws(() => store.validateReports({ reports: [report] }), /invalid/);
  assert.equal(store.snapshot().characters.length, 1);
  db.close();
});
test("v2 학교 DB는 명시적 이전으로 등록 요청 표를 추가하고 기존 설정을 보존한다", () => {
  const { db, key, school } = setup();
  const before = school.snapshot();
  db.exec("DROP TABLE school_ap_bssid; DROP TABLE school_wifi_request; PRAGMA user_version=2;");
  assert.throws(() => new SchoolStore(db, key));
  migrateSchoolDatabase(db, key);
  assert.equal(db.pragma("user_version", { simple: true }), 4);
  assert.deepEqual(new SchoolStore(db, key).snapshot(), { ...before, version: before.version + 1 });
  db.close();
});
