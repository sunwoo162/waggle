import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { authorizeAdmin } from "../apps/admin/src/server/auth/access";
import { createDataGsmAuth, migrateAuth } from "../apps/admin/src/server/auth/factory";
import { createMemberAuth, migrateMembers } from "../apps/admin/src/server/members/factory";
import { MemberService } from "../apps/admin/src/server/members/service";

async function setup() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys=ON");
  const settings = {
    baseURL: "http://localhost:3000",
    secret: randomBytes(32).toString("base64url"),
  };
  const auth = createMemberAuth(settings, database);
  await migrateMembers(auth, database, settings);
  const service = new MemberService(database, auth, settings);
  return { database, settings, auth, service };
}
test("발급 코드는 검증값만 저장하고 코드 하나로 같은 사용자에게 독립 기기 세션을 발급한다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 이용자");
  assert.match(issued.code, /^WG\.[a-f0-9]{16}\.[A-Za-z0-9_-]{32}$/);
  const phone = await service.login({
    code: issued.code,
    platform: "android",
    deviceName: "검증 휴대폰",
  });
  const pc = await service.login({
    code: issued.code,
    platform: "windows",
    deviceName: "검증 노트북",
  });
  assert.notEqual(phone.refreshToken, pc.refreshToken);
  const a = await service.access(phone.accessToken);
  const b = await service.access(pc.accessToken);
  assert.equal(a.member.id, b.member.id);
  assert.notEqual(a.device.id, b.device.id);
  const serialized = JSON.stringify(service.snapshot());
  assert.equal(serialized.includes(issued.code), false);
  assert.equal(serialized.includes(phone.refreshToken), false);
  assert.equal(serialized.includes(phone.accessToken), false);
  assert.equal(serialized.includes("codeHash"), false);
  const row = database.prepare("SELECT code_hash FROM native_member").get() as {
    code_hash: string;
  };
  assert.equal(row.code_hash.includes(issued.code.split(".")[2]), false);
  assert.equal(service.snapshot().members.length, 1);
  database.close();
});
test("갱신은 절대 수명을 유지하며 이전 갱신/접근 토큰을 다시 사용할 수 없다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 갱신");
  const old = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  const fresh = await service.refresh(old.refreshToken);
  assert.notEqual(fresh.refreshToken, old.refreshToken);
  assert.equal(fresh.refreshExpiresAt, old.refreshExpiresAt);
  await assert.rejects(() => service.refresh(old.refreshToken), /unauthorized/);
  await assert.rejects(() => service.access(old.accessToken), /unauthorized/);
  assert.equal((await service.access(fresh.accessToken)).member.id, issued.member.id);
  assert.equal(service.snapshot().members[0].devices.length, 1);
  const concurrent = await Promise.allSettled([
    service.refresh(fresh.refreshToken),
    service.refresh(fresh.refreshToken),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  database.close();
});
test("기기 로그아웃과 운영자 기기 회수는 다른 기기를 유지한다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 기기");
  const a = await service.login({ code: issued.code, platform: "android", deviceName: "휴대폰" });
  const b = await service.login({ code: issued.code, platform: "windows", deviceName: "노트북" });
  await service.logout(a.refreshToken);
  await assert.rejects(() => service.access(a.accessToken), /unauthorized/);
  const active = await service.access(b.accessToken);
  const member = service.snapshot().members[0];
  await service.revokeDevice(member.id, active.device.id, member.revision);
  await assert.rejects(() => service.refresh(b.refreshToken), /unauthorized/);
  await service.logout("invalid");
  database.close();
});
test("회수·재발급은 기존 코드와 모든 기기를 막고 사용자 ID를 유지한다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 회수");
  const pair = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  let member = service.snapshot().members[0];
  await service.revoke(member.id, member.revision);
  await assert.rejects(() => service.access(pair.accessToken), /unauthorized/);
  await assert.rejects(() => service.refresh(pair.refreshToken), /unauthorized/);
  await assert.rejects(
    () => service.login({ code: issued.code, platform: "windows", deviceName: "검증" }),
    /unauthorized/,
  );
  member = service.snapshot().members[0];
  const next = await service.reissue(member.id, member.revision);
  assert.notEqual(next.code, issued.code);
  assert.equal(next.member.id, issued.member.id);
  const fresh = await service.login({ code: next.code, platform: "windows", deviceName: "검증" });
  const newer = await service.reissue(next.member.id, next.member.revision);
  await assert.rejects(() => service.access(fresh.accessToken), /unauthorized/);
  await assert.rejects(
    () => service.login({ code: next.code, platform: "android", deviceName: "검증" }),
    /unauthorized/,
  );
  assert.equal(newer.member.id, issued.member.id);
  const before = service.snapshot();
  await assert.rejects(() => service.reissue(newer.member.id, next.member.revision), /conflict/);
  assert.deepEqual(service.snapshot(), before);
  database.close();
});
test("코드 실패 제한·형식·만료·토큰 종류 혼용을 거부한다", async () => {
  const { database, service, auth } = await setup();
  const issued = await service.issue("합성 제한");
  const bad = issued.code.slice(0, -1) + (issued.code.endsWith("a") ? "b" : "a");
  for (let i = 0; i < 10; i++)
    await assert.rejects(
      () => service.login({ code: bad, platform: "android", deviceName: "검증" }),
      /unauthorized/,
    );
  await assert.rejects(
    () => service.login({ code: issued.code, platform: "android", deviceName: "검증" }),
    /rate_limited/,
  );
  database.prepare("DELETE FROM native_limit").run();
  const pair = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  await assert.rejects(() => service.access(pair.refreshToken), /unauthorized/);
  await assert.rejects(() => service.refresh(pair.accessToken), /unauthorized/);
  await assert.rejects(() => service.access("forged.token.value"), /unauthorized/);
  const current = await service.access(pair.accessToken);
  const expired = await auth.api.signJWT({
    body: {
      payload: {
        sub: current.userId,
        sid: current.sessionId,
        type: "access",
        exp: Math.floor(Date.now() / 1000) - 60,
      },
    },
  });
  await assert.rejects(() => service.access(expired.token), /unauthorized/);
  database.prepare("UPDATE native_device SET expires_at=0").run();
  await assert.rejects(() => service.access(pair.accessToken), /unauthorized/);
  await assert.rejects(() => service.refresh(pair.refreshToken), /unauthorized/);
  database.close();
});
test("키 변경은 기존 저장소를 열지 않으며 DB 재개방 후에도 회수 상태가 유지된다", async () => {
  const { database, service, settings, auth } = await setup();
  const issued = await service.issue("합성 영속");
  const pair = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  const member = service.snapshot().members[0];
  await service.revoke(member.id, member.revision);
  const copied = new Database(database.serialize());
  copied.pragma("foreign_keys=ON");
  const reopenedAuth = createMemberAuth(settings, copied);
  await migrateMembers(reopenedAuth, copied, settings);
  const reopened = new MemberService(copied, reopenedAuth, settings);
  await assert.rejects(() => reopened.access(pair.accessToken), /unauthorized/);
  assert.throws(
    () => new MemberService(copied, auth, { ...settings, secret: "wrong-secret" }),
    /unavailable/,
  );
  copied.close();
  database.close();
});
test("비동기 코드 검증 중 회수된 사용자는 새 기기 세션을 얻지 못한다", async () => {
  const { database, service, auth } = await setup();
  const issued = await service.issue("합성 경합");
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const verify = auth.api.verifyInviteSecret;
  auth.api.verifyInviteSecret = (async (args) => {
    const result = await verify(args);
    reached();
    await gate;
    return result;
  }) as typeof verify;
  const pending = service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  await ready;
  await service.revoke(issued.member.id, issued.member.revision);
  release();
  await assert.rejects(() => pending, /unauthorized/);
  assert.equal(service.snapshot().members[0].devices.length, 0);
  assert.equal(
    (database.prepare('SELECT COUNT(*) AS count FROM "session"').get() as { count: number }).count,
    0,
  );
  database.close();
});
test("입력 형식을 엄격히 확인하고 JWT에는 내부 이메일·별칭을 넣지 않는다", async () => {
  const { database, service } = await setup();
  await assert.rejects(() => service.issue("\ud800"), /invalid/);
  const issued = await service.issue("합성 최소 정보");
  const pair = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  const payload = JSON.parse(
    Buffer.from(pair.accessToken.split(".")[1], "base64url").toString("utf8"),
  );
  assert.equal(payload.exp - payload.iat, 900);
  assert.equal(payload.aud, "waggle-gsm-native");
  assert.equal(payload.email, undefined);
  assert.equal(payload.name, undefined);
  assert.equal(JSON.stringify(payload).includes("합성 최소 정보"), false);
  await assert.rejects(
    () => service.login({ code: issued.code, platform: {}, deviceName: "검증" }),
    /invalid/,
  );
  database.close();
});

test("토큰 서명 실패는 미완료 기기를 남기지 않고 갱신 전 세션을 보존한다", async () => {
  const { database, service, auth } = await setup();
  const issued = await service.issue("합성 서명 오류");
  const sign = auth.api.signJWT;
  const fail = (async () => {
    throw new Error("synthetic-signing-unavailable");
  }) as typeof sign;
  auth.api.signJWT = fail;
  await assert.rejects(
    () => service.login({ code: issued.code, platform: "android", deviceName: "검증" }),
    /synthetic-signing-unavailable/,
  );
  assert.equal(service.snapshot().members[0].devices.length, 0);
  auth.api.signJWT = sign;
  const old = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  auth.api.signJWT = fail;
  await assert.rejects(() => service.refresh(old.refreshToken), /synthetic-signing-unavailable/);
  auth.api.signJWT = sign;
  assert.equal((await service.access(old.accessToken)).member.id, issued.member.id);
  await service.refresh(old.refreshToken);
  database.close();
});

test("갱신 서명 중 회수돼도 실패 복구가 회수를 되돌리지 않는다", async () => {
  const { database, service, auth } = await setup();
  const issued = await service.issue("합성 회수 경합");
  const old = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  const sign = auth.api.signJWT;
  auth.api.signJWT = (async (args) => {
    await service.revoke(issued.member.id, issued.member.revision);
    return sign(args);
  }) as typeof sign;
  await assert.rejects(() => service.refresh(old.refreshToken), /unauthorized/);
  await assert.rejects(() => service.access(old.accessToken), /unauthorized/);
  await assert.rejects(() => service.refresh(old.refreshToken), /unauthorized/);
  assert.equal(service.snapshot().members[0].devices[0].status, "revoked");
  database.close();
});

test("일반 사용자 토큰·쿠키는 별도 운영자 인증에서 인정되지 않는다", async () => {
  const { database, service, settings } = await setup();
  const issued = await service.issue("합성 권한 분리");
  const pair = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  const adminDb = new Database(":memory:");
  const adminAuth = createDataGsmAuth({
    settings: { ...settings, clientId: "fixture", operatorSubject: "42" },
    database: adminDb,
  });
  await migrateAuth(adminAuth.options);
  for (const token of [pair.accessToken, pair.refreshToken]) {
    const access = await authorizeAdmin(
      adminAuth,
      adminDb,
      new Headers({
        authorization: `Bearer ${token}`,
        cookie: `better-auth.session_token=${token}; waggle-member.session_token=${token}`,
      }),
      "42",
    );
    assert.equal(access.kind, "unauthenticated");
  }
  adminDb.close();
  database.close();
});
test("잘못된 코드 요청이 많아도 다른 사용자의 코드 로그인을 막지 않는다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 정상 이용자");
  for (let i = 0; i < 130; i++)
    await service
      .login({
        code: `WG.${i.toString(16).padStart(16, "0")}.${"x".repeat(32)}`,
        platform: "android",
        deviceName: "검증",
      })
      .catch(() => undefined);
  const pair = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  assert.ok(pair.accessToken);
  database.close();
});
test("잘못된 갱신 토큰이 많아도 다른 기기의 갱신을 막지 않고, 기기별 갱신 횟수는 제한한다", async () => {
  const { database, service } = await setup();
  const issued = await service.issue("합성 갱신 제한");
  let pair = await service.login({ code: issued.code, platform: "windows", deviceName: "검증" });
  for (let i = 0; i < 130; i++)
    await assert.rejects(() => service.refresh(`forged.refresh.${i}`), /unauthorized/);
  pair = await service.refresh(pair.refreshToken);
  for (let i = 0; i < 9; i++) pair = await service.refresh(pair.refreshToken);
  await assert.rejects(() => service.refresh(pair.refreshToken), /rate_limited/);
  database.prepare("DELETE FROM native_limit").run();
  pair = await service.refresh(pair.refreshToken);
  const other = await service.login({ code: issued.code, platform: "android", deviceName: "검증" });
  assert.ok((await service.refresh(other.refreshToken)).accessToken);
  database.close();
});
