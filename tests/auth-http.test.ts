import assert from "node:assert/strict";
import test from "node:test";
import type { AdminAccess } from "../apps/admin/src/server/auth/access";
import {
  createAdminSessionHandler,
  createAuthHttpHandler,
} from "../apps/admin/src/server/auth/http";

test("관리자 API는 503·401·403·200을 구분하고 토큰을 반환하지 않는다", async () => {
  const cases: [AdminAccess, number][] = [
    [{ kind: "unconfigured" }, 503],
    [{ kind: "unavailable" }, 503],
    [{ kind: "unauthenticated" }, 401],
    [{ kind: "forbidden" }, 403],
    [
      {
        kind: "authorized",
        user: { id: "local-fixture", name: "테스트 운영자" },
        signedInAt: Date.now(),
      },
      200,
    ],
  ];
  for (const [access, status] of cases) {
    const response = await createAdminSessionHandler(async () => access)(
      new Request("http://127.0.0.1:3000/api/admin/session"),
    );
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const data = await response.json();
    assert.equal("token" in data, false);
    if (status === 200)
      assert.deepEqual(data, {
        role: "admin",
        user: { id: "local-fixture", name: "테스트 운영자" },
      });
  }
});

test("미설정·저장소 실패는 내부 오류 원문 없이 닫는다", async () => {
  const unavailable = createAuthHttpHandler(async () => null);
  const response = await unavailable(
    new Request("http://127.0.0.1:3000/api/auth/sign-in/social", { method: "POST" }),
  );
  assert.equal(response.status, 503);
  const broken = createAdminSessionHandler(async () => {
    throw new Error("private fixture failure");
  });
  const failed = await broken(new Request("http://127.0.0.1:3000/api/admin/session"));
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private fixture failure"));
});

test("필요한 인증 경로·메서드만 인스턴스에 전달한다", async () => {
  let resolved = 0;
  const forwarded: string[] = [];
  const handler = createAuthHttpHandler(async () => {
    resolved++;
    return {
      handler: async (request: Request) => {
        forwarded.push(new URL(request.url).pathname);
        return Response.json({ ok: true });
      },
    };
  });
  for (const route of [
    "sign-up/email",
    "link-social",
    "get-access-token",
    "get-session",
    "update-user",
    "callback/other",
  ]) {
    assert.equal(
      (await handler(new Request(`http://127.0.0.1:3000/api/auth/${route}`, { method: "POST" })))
        .status,
      404,
    );
  }
  assert.equal(resolved, 0);
  const wrong = await handler(new Request("http://127.0.0.1:3000/api/auth/sign-out"));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("allow"), "POST");
  for (const [route, method] of [
    ["sign-in/social", "POST"],
    ["callback/datagsm", "GET"],
    ["sign-out", "POST"],
  ]) {
    assert.equal(
      (await handler(new Request(`http://127.0.0.1:3000/api/auth/${route}`, { method }))).status,
      200,
    );
  }
  assert.equal(forwarded.length, 3);
});

test("인증 리다이렉트의 불변 헤더도 상태와 쿠키를 유지한다", async () => {
  const handler = createAuthHttpHandler(async () => ({
    handler: async () => Response.redirect("http://127.0.0.1:3000/admin", 302),
  }));
  const response = await handler(new Request("http://127.0.0.1:3000/api/auth/callback/datagsm"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3000/admin");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
