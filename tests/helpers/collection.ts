import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { createMemberAuth, migrateMembers } from "../../apps/admin/src/server/members/factory";
import { MemberService } from "../../apps/admin/src/server/members/service";
import { migrateSchoolDatabase, SchoolStore } from "../../apps/admin/src/server/school/store";

export async function collectionFixture() {
  const db = new Database(":memory:");
  const settings = {
    baseURL: "http://localhost:3000",
    secret: randomBytes(32).toString("base64url"),
  };
  const auth = createMemberAuth(settings, db);
  await migrateMembers(auth, db, settings);
  let now = Date.now();
  const members = new MemberService(db, auth, settings, () => now);
  // This in-memory fixture does not contain a real school identity or credential.
  const key = randomBytes(32);
  const school = new Database(":memory:");
  migrateSchoolDatabase(school, key);
  const store = new SchoolStore(school, key);
  const network = store.saveNetwork({
    name: "합성 학교망",
    ssid: " QA SSID ",
    security: "open",
    password: "",
    enabled: true,
  });
  const ap = store.saveAccessPoint({
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
    auth,
    settings,
    members,
    school: store,
    ap,
    network,
    advance: () => {
      now += 300_001;
    },
    close: () => {
      db.close();
      school.close();
    },
  };
}
