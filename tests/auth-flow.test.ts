import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { authorizeAdmin } from "../apps/admin/src/server/auth/access";
import { createDataGsmAuth, migrateAuth } from "../apps/admin/src/server/auth/factory";
import { createAuthHttpHandler } from "../apps/admin/src/server/auth/http";

const baseURL = "http://127.0.0.1:3000";
const settings = {
  baseURL,
  secret: "unit-test-secret-with-at-least-32-characters",
  clientId: "fixture-client",
  operatorSubject: "42",
};
const operator = {
  id: 42,
  email: "fixture@gsm.hs.kr",
  status: "ACTIVE",
  role: "USER",
  objectType: "STUDENT",
  student: {
    name: "테스트 운영자",
    role: "GENERAL_STUDENT",
    isLeaveSchool: false,
    dormitoryRoom: 999,
  },
};

function jar(response: Response, previous = "") {
  const values = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((value) => {
        const at = value.indexOf("=");
        return [value.slice(0, at), value.slice(at + 1)];
      }),
  );
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const at = pair.indexOf("=");
    if (!pair.slice(at + 1)) values.delete(pair.slice(0, at));
    else values.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function fixture(
  profile: unknown = operator,
  filename = ":memory:",
  failure?: "token" | "userinfo",
) {
  const database = new Database(filename);
  const calls: { url: string; request: Request; body?: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = request.url;
    if (url === "https://oauth.authorization.datagsm.kr/v1/oauth/token") {
      const body = (await request.json()) as Record<string, unknown>;
      calls.push({ url, request, body });
      if (failure === "token") return new Response("private-upstream-fixture", { status: 503 });
      return Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "datagsm:self_read",
      });
    }
    if (url === "https://oauth.resource.datagsm.kr/userinfo") {
      calls.push({ url, request });
      if (failure === "userinfo") return new Response("private-upstream-fixture", { status: 503 });
      return Response.json(profile);
    }
    throw new Error("unexpected provider request");
  };
  const auth = createDataGsmAuth({ settings, database, fetcher });
  await migrateAuth(auth.options);
  const handle = createAuthHttpHandler(async () => auth);
  async function begin(callbackURL = "/admin") {
    const response = await handle(
      new Request(`${baseURL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin: baseURL, "content-type": "application/json" },
        body: JSON.stringify({
          provider: "datagsm",
          callbackURL,
          errorCallbackURL: "/sign-in",
          disableRedirect: true,
        }),
      }),
    );
    return response;
  }
  async function flow() {
    const start = await begin();
    assert.equal(start.status, 200);
    const data = (await start.json()) as { url: string };
    const url = new URL(data.url);
    const cookie = jar(start);
    const callbackURL = `${baseURL}/api/auth/callback/datagsm?code=fixture-code&state=${encodeURIComponent(url.searchParams.get("state") ?? "")}`;
    const response = await handle(new Request(callbackURL, { headers: { cookie } }));
    return { url, cookie, callbackURL, response, sessionCookie: jar(response, cookie) };
  }
  return { auth, database, calls, begin, flow };
}

test("PKCE·JSON 교환·검증된 본인 정보로만 운영자 세션을 발급한다", async () => {
  const f = await fixture();
  try {
    const result = await f.flow();
    assert.equal(result.url.origin, "https://oauth.authorization.datagsm.kr");
    assert.equal(result.url.searchParams.get("scope"), "datagsm:self_read");
    assert.equal(result.url.searchParams.get("code_challenge_method"), "S256");
    const token = f.calls.find((call) => call.body);
    assert.match(token?.request.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(token?.body?.client_id, "fixture-client");
    assert.equal(token?.body?.redirect_uri, `${baseURL}/api/auth/callback/datagsm`);
    assert.equal(token?.body?.grant_type, "authorization_code");
    const verifier = token?.body?.code_verifier;
    assert.equal(typeof verifier, "string");
    assert.equal(
      createHash("sha256").update(String(verifier)).digest("base64url"),
      result.url.searchParams.get("code_challenge"),
    );
    assert.equal(token?.body?.client_secret, undefined);
    assert.equal(result.response.status, 302);
    assert.equal(
      new URL(result.response.headers.get("location") ?? "", baseURL).pathname,
      "/admin",
    );
    const access = await authorizeAdmin(
      f.auth,
      f.database,
      new Headers({ cookie: result.sessionCookie }),
      "42",
    );
    assert.equal(access.kind, "authorized");
    assert.ok(!JSON.stringify(access).includes("fixture-access"));
    assert.ok(!JSON.stringify(access).includes("fixture-refresh"));
    assert.ok(
      result.response.headers
        .getSetCookie()
        .some((cookie) => cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax")),
    );
    const account = f.database
      .prepare('SELECT "accessToken", "refreshToken" FROM "account"')
      .get() as Record<string, unknown>;
    assert.notEqual(account.accessToken, "fixture-access");
    assert.notEqual(account.refreshToken, "fixture-refresh");
    assert.ok(
      !JSON.stringify(f.database.prepare('SELECT * FROM "user"').get()).includes("dormitory"),
    );
  } finally {
    f.database.close();
  }
});

test("다른 계정의 ADMIN 역할과 비활성 운영자는 로컬 계정·세션을 얻지 못한다", async () => {
  for (const profile of [
    { ...operator, id: 43, role: "ADMIN" },
    { ...operator, status: "PENDING" },
  ]) {
    const f = await fixture(profile);
    try {
      const result = await f.flow();
      assert.equal(
        (
          await authorizeAdmin(
            f.auth,
            f.database,
            new Headers({ cookie: result.sessionCookie }),
            "42",
          )
        ).kind,
        "unauthenticated",
      );
      assert.equal(
        (f.database.prepare('SELECT count(*) AS count FROM "user"').get() as { count: number })
          .count,
        0,
      );
    } finally {
      f.database.close();
    }
  }
});

test("state 누락·변조·재사용은 토큰 교환을 수행하지 않는다", async () => {
  const f = await fixture();
  try {
    await f.auth.handler(new Request(`${baseURL}/api/auth/callback/datagsm?code=fixture-code`));
    assert.equal(f.calls.length, 0);
    const first = await f.begin();
    const firstCookie = jar(first);
    await f.auth.handler(
      new Request(`${baseURL}/api/auth/callback/datagsm?code=fixture-code&state=wrong`, {
        headers: { cookie: firstCookie },
      }),
    );
    assert.equal(f.calls.length, 0);
    const result = await f.flow();
    const completed = f.calls.length;
    await f.auth.handler(new Request(result.callbackURL, { headers: { cookie: result.cookie } }));
    assert.equal(f.calls.length, completed);
  } finally {
    f.database.close();
  }
});

test("외부 복귀 URL·Origin과 위조 쿠키는 거부한다", async () => {
  const f = await fixture();
  try {
    assert.ok((await f.begin("https://attacker.example/admin")).status >= 400);
    assert.equal(
      (
        await authorizeAdmin(
          f.auth,
          f.database,
          new Headers({ cookie: "better-auth.session_token=forged" }),
          "42",
        )
      ).kind,
      "unauthenticated",
    );
    const result = await f.flow();
    const denied = await f.auth.handler(
      new Request(`${baseURL}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          cookie: result.sessionCookie,
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(denied.status, 403);
    assert.equal(
      (
        await authorizeAdmin(
          f.auth,
          f.database,
          new Headers({ cookie: result.sessionCookie }),
          "42",
        )
      ).kind,
      "authorized",
    );
  } finally {
    f.database.close();
  }
});

test("DB 재조회·운영자 변경·만료·로그아웃을 즉시 반영한다", async () => {
  const f = await fixture();
  try {
    const result = await f.flow();
    const headers = new Headers({ cookie: result.sessionCookie });
    const restarted = createDataGsmAuth({ settings, database: f.database });
    assert.equal((await authorizeAdmin(restarted, f.database, headers, "42")).kind, "authorized");
    assert.equal((await authorizeAdmin(restarted, f.database, headers, "43")).kind, "forbidden");
    const logout = await f.auth.handler(
      new Request(`${baseURL}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          cookie: result.sessionCookie,
          origin: baseURL,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(logout.status, 200);
    assert.equal(
      (await authorizeAdmin(restarted, f.database, headers, "42")).kind,
      "unauthenticated",
    );
    const again = await f.flow();
    f.database.prepare('UPDATE "session" SET "expiresAt" = 0').run();
    assert.equal(
      (await authorizeAdmin(f.auth, f.database, new Headers({ cookie: again.sessionCookie }), "42"))
        .kind,
      "unauthenticated",
    );
  } finally {
    f.database.close();
  }
});

test("SQLite 연결을 닫고 다시 열어도 세션을 확인한다", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "waggle-auth-session-"));
  const filename = path.join(temp, "auth.sqlite");
  const f = await fixture(operator, filename);
  let firstClosed = false;
  let reopened: Database.Database | undefined;
  try {
    const result = await f.flow();
    f.database.close();
    firstClosed = true;
    reopened = new Database(filename);
    const auth = createDataGsmAuth({ settings, database: reopened });
    await migrateAuth(auth.options);
    assert.equal(
      (await authorizeAdmin(auth, reopened, new Headers({ cookie: result.sessionCookie }), "42"))
        .kind,
      "authorized",
    );
  } finally {
    if (!firstClosed) f.database.close();
    reopened?.close();
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  }
});

test("제공자 장애 원문은 반환하지 않고 세션도 만들지 않는다", async () => {
  for (const failure of ["token", "userinfo"] as const) {
    const f = await fixture(operator, ":memory:", failure);
    try {
      const result = await f.flow();
      assert.ok(
        !(result.response.headers.get("location") ?? "").includes("private-upstream-fixture"),
      );
      assert.ok(!(await result.response.text()).includes("private-upstream-fixture"));
      assert.equal(
        (f.database.prepare('SELECT count(*) AS count FROM "session"').get() as { count: number })
          .count,
        0,
      );
    } finally {
      f.database.close();
    }
  }
});

test("인증 취소의 외부 설명을 공개 복귀 URL에 남기지 않는다", async () => {
  const f = await fixture();
  try {
    const start = await f.begin();
    const data = (await start.json()) as { url: string };
    const state = new URL(data.url).searchParams.get("state") ?? "";
    const response = await createAuthHttpHandler(async () => f.auth)(
      new Request(
        `${baseURL}/api/auth/callback/datagsm?error=access_denied&error_description=private-provider-fixture&state=${encodeURIComponent(state)}`,
        { headers: { cookie: jar(start) } },
      ),
    );
    assert.equal(f.calls.length, 0);
    assert.ok(!(response.headers.get("location") ?? "").includes("private-provider-fixture"));
  } finally {
    f.database.close();
  }
});
