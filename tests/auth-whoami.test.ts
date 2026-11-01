import assert from "node:assert/strict";
import test from "node:test";
import { readOwnAccountId, whoamiAuthorizeUrl } from "../apps/admin/src/server/auth/whoami";

const input = {
  code: "synthetic-code",
  clientId: "synthetic-client",
  redirectUri: "http://localhost:3000/api/auth/callback/datagsm",
  verifier: "synthetic-verifier",
};
function fake(token: unknown, info: unknown, ok = true): typeof fetch {
  return (async (url: string | URL) =>
    new Response(JSON.stringify(String(url).includes("/token") ? token : info), {
      status: ok ? 200 : 400,
    })) as typeof fetch;
}

test("내 DataGSM 계정 ID 확인은 PKCE 주소를 만들고 최상위 id만 돌려준다", async () => {
  const url = new URL(
    whoamiAuthorizeUrl({
      clientId: "c",
      redirectUri: input.redirectUri,
      state: "s",
      challenge: "x",
    }),
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "datagsm:self_read");
  assert.equal(url.searchParams.get("redirect_uri"), input.redirectUri);
  const token = { access_token: "synthetic-token", token_type: "Bearer", expires_in: 60 };
  assert.equal(await readOwnAccountId(fake(token, { id: 42, student: { id: 7 } }), input), "42");
  for (const [t, i, ok] of [
    [token, { id: 0 }, true],
    [token, { student: { id: 7 } }, true],
    [{}, { id: 42 }, true],
    [token, { id: 42 }, false],
  ] as const)
    assert.equal(await readOwnAccountId(fake(t, i, ok), input), null);
  assert.equal(
    await readOwnAccountId(
      (async () => {
        throw new Error("offline");
      }) as typeof fetch,
      input,
    ),
    null,
  );
});
