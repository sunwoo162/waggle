import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { createMemberAuth, migrateMembers } from "../apps/admin/src/server/members/factory";
import {
  createClientHandler,
  createMemberAdminHandler,
} from "../apps/admin/src/server/members/http";
import { MemberService } from "../apps/admin/src/server/members/service";

const origin = "http://localhost:3000";
async function setup() {
  const db = new Database(":memory:");
  const settings = { baseURL: origin, secret: randomBytes(32).toString("base64url") };
  const auth = createMemberAuth(settings, db);
  await migrateMembers(auth, db, settings);
  const service = new MemberService(db, auth, settings);
  const audited: string[] = [];
  const admin = createMemberAdminHandler({
    getAccess: async () => ({
      kind: "authorized",
      user: { id: "operator", name: "합성 운영자" },
      signedInAt: Date.now(),
    }),
    getService: () => service,
    origin: () => origin,
    audit: (_operator, action, target) => audited.push(`${action}:${target}`),
  });
  const client = createClientHandler({ getService: () => service, origin: () => origin });
  return { db, service, admin, client, audited };
}
function counts(db: Database.Database) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    members: n("SELECT COUNT(*) n FROM native_member"),
    devices: n("SELECT COUNT(*) n FROM native_device"),
    collection: n("SELECT COUNT(*) n FROM native_collection"),
    users: n('SELECT COUNT(*) n FROM "user"'),
    sessions: n('SELECT COUNT(*) n FROM "session"'),
  };
}

test("계정 삭제는 로그인 수단·기기 세션·수집 집합을 지우고 다른 계정은 그대로 둔다", async () => {
  const { db, service } = await setup();
  const keep = await service.issue("남는 이용자");
  await service.login({ code: keep.code, platform: "windows", deviceName: "검증" });
  const gone = await service.issue("지울 이용자");
  const pair = await service.login({ code: gone.code, platform: "android", deviceName: "검증" });
  const identity = await service.access(pair.accessToken);
  service.mergeCollection(identity, [randomUUID()]);
  const before = counts(db);
  await service.deleteMember(gone.member.id);
  assert.deepEqual(counts(db), {
    members: before.members - 1,
    devices: before.devices - 1,
    collection: before.collection - 1,
    users: before.users - 1,
    sessions: before.sessions - 1,
  });
  await assert.rejects(() => service.access(pair.accessToken), /unauthorized/);
  await assert.rejects(() => service.refresh(pair.refreshToken), /unauthorized/);
  await assert.rejects(
    () => service.login({ code: gone.code, platform: "android", deviceName: "검증" }),
    /unauthorized/,
  );
  await assert.rejects(() => service.deleteMember(gone.member.id), /unauthorized|not_found/);
  assert.equal(service.snapshot().members.length, 1);
  db.close();
});

test("앱에서 본인 계정을 지울 수 있고 토큰이 없으면 거부한다", async () => {
  const { db, service, client } = await setup();
  const issued = await service.issue("앱 삭제");
  const pair = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  const call = (token?: string) =>
    client(
      new Request(`${origin}/api/client/account-delete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: "{}",
      }),
    );
  assert.equal((await call()).status, 401);
  assert.equal((await call(pair.accessToken)).status, 204);
  assert.equal(counts(db).members, 0);
  assert.equal((await call(pair.accessToken)).status, 401);
  db.close();
});

test("운영자 삭제는 수정 버전을 확인하고 값 없이 기록한다", async () => {
  const { db, service, admin, audited } = await setup();
  const issued = await service.issue("운영자 삭제");
  const del = (revision: number) =>
    admin(
      new Request(`${origin}/api/admin/members/${issued.member.id}/delete`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ revision }),
      }),
    );
  assert.equal((await del(issued.member.revision + 5)).status, 409);
  assert.equal(counts(db).members, 1);
  assert.equal((await del(issued.member.revision)).status, 200);
  assert.equal(counts(db).members, 0);
  assert.deepEqual(audited, [`member.delete:${issued.member.id}`]);
  db.close();
});
