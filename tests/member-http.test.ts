import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
  const admin = createMemberAdminHandler({
    getAccess: async () => ({ kind: "authorized", user: { id: "operator", name: "합성 운영자" } }),
    getService: () => service,
    origin: () => origin,
  });
  const client = createClientHandler({ getService: () => service, origin: () => origin });
  return { db, auth, service, admin, client };
}
function post(path: string, body: unknown, headers: Record<string, string> = { origin }) {
  return new Request(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
test("관리 API는 운영자 인증·Origin을 확인하고 실패 시 저장소를 열지 않는다", async () => {
  for (const [kind, status] of [
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["unconfigured", 503],
  ] as const) {
    let opened = false;
    const handler = createMemberAdminHandler({
      getAccess: async () => ({ kind }),
      getService: () => {
        opened = true;
        throw new Error("private");
      },
      origin: () => origin,
    });
    assert.equal((await handler(post("/api/admin/members", { alias: "검증" }))).status, status);
    assert.equal(opened, false);
  }
  const { db, admin } = await setup();
  assert.equal(
    (
      await admin(
        post("/api/admin/members", { alias: "검증" }, { origin: "https://outside.invalid" }),
      )
    ).status,
    403,
  );
  assert.equal((await admin(post("/api/admin/members", { alias: "x".repeat(17000) }))).status, 413);
  db.close();
});
test("발급 응답에만 코드가 있고 목록에는 코드·해시·토큰·내부 이메일이 없다", async () => {
  const { db, admin } = await setup();
  const response = await admin(post("/api/admin/members", { alias: "합성 이용자" }));
  assert.equal(response.status, 201);
  const issued = await response.json();
  assert.ok(issued.code);
  const list = await admin(new Request(`${origin}/api/admin/members`));
  const text = await list.text();
  assert.equal(text.includes(issued.code), false);
  assert.equal(text.includes("code_hash"), false);
  assert.equal(text.includes("@invite"), false);
  assert.match(list.headers.get("cache-control") || "", /no-store/);
  assert.equal(
    (
      await admin(
        post(`/api/admin/members/${issued.member.id}/reissue`, {
          revision: issued.member.revision,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await admin(
        post(`/api/admin/members/${issued.member.id}/revoke`, { revision: issued.member.revision }),
      )
    ).status,
    409,
  );
  db.close();
});
test("공개 코드는 이메일 없이 로그인하고 갱신·본인 조회·로그아웃이 동작한다", async () => {
  const { db, service, client } = await setup();
  const issued = await service.issue("합성 앱");
  const login = await client(
    post(
      "/api/client/code-login",
      { code: issued.code, platform: "windows", deviceName: "검증 노트북" },
      {},
    ),
  );
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("set-cookie"), null);
  const pair = await login.json();
  const info = await client(
    new Request(`${origin}/api/client/me`, {
      headers: { authorization: `Bearer ${pair.accessToken}` },
    }),
  );
  assert.equal(info.status, 200);
  const own = await info.json();
  assert.equal(own.member.id, issued.member.id);
  assert.equal(own.userId, undefined);
  const fresh = await client(post("/api/client/refresh", { refreshToken: pair.refreshToken }, {}));
  assert.equal(fresh.status, 200);
  const next = await fresh.json();
  const out = await client(post("/api/client/logout", { refreshToken: next.refreshToken }, {}));
  assert.equal(out.status, 204);
  assert.equal(
    (
      await client(
        new Request(`${origin}/api/client/me`, {
          headers: { authorization: `Bearer ${next.accessToken}` },
        }),
      )
    ).status,
    401,
  );
  db.close();
});
test("공개 경계는 쿠키·외부 Origin·알 수 없는 경로·과대 본문을 거부한다", async () => {
  const { db, client, auth } = await setup();
  assert.equal(
    (
      await client(
        new Request(`${origin}/api/client/me`, {
          headers: { cookie: "waggle-member.session_token=forged" },
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (await client(post("/api/client/code-login", {}, { origin: "https://outside.invalid" })))
      .status,
    403,
  );
  assert.equal(
    (await client(post("/api/client/code-login", { code: "x".repeat(17000) }, {}))).status,
    413,
  );
  assert.equal((await client(new Request(`${origin}/api/client/code-login`))).status, 405);
  assert.equal((await client(post("/api/client/sign-up/email", {}, {}))).status, 404);
  assert.equal(
    (
      await auth.handler(
        post("/api/member-internal/hash-invite-secret", { secret: "x".repeat(32) }, {}),
      )
    ).status,
    404,
  );
  db.close();
});
