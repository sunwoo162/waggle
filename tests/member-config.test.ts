import assert from "node:assert/strict";
import test from "node:test";
import { readMemberConfig } from "../apps/admin/src/server/members/config";

test("사용자 인증은 DataGSM 설정과 독립이며 secret 문맥·DB 경로를 분리한다", () => {
  const env = {
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "synthetic-master-secret-at-least-32-characters",
  };
  const a = readMemberConfig(env, process.cwd());
  const b = readMemberConfig(env, process.cwd());
  assert.equal(a.secret, b.secret);
  assert.notEqual(a.secret, env.BETTER_AUTH_SECRET);
  for (const extra of [
    { BETTER_AUTH_URL: "http://outside.invalid" },
    { BETTER_AUTH_SECRET: "short" },
    { BETTER_AUTH_URL: "https://site.invalid/path" },
    { WAGGLE_MEMBERS_DATABASE_PATH: ".data/auth.sqlite" },
    { WAGGLE_MEMBERS_DATABASE_PATH: ".data/school.sqlite" },
    { WAGGLE_MEMBERS_DATABASE_PATH: "public/members.sqlite" },
    { WAGGLE_MEMBERS_DATABASE_PATH: ".next/members.sqlite" },
  ])
    assert.throws(() => readMemberConfig({ ...env, ...extra }, process.cwd()), /unavailable/);
});
