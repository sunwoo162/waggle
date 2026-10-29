import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readSchoolConfig } from "../apps/admin/src/server/school/config";
import { initializeSchoolEnv } from "../scripts/setup-school.mjs";

test("저장 키는 독립된 32바이트이며 공개·인증 DB 경로는 거부한다", () => {
  const env = { WAGGLE_SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };
  assert.equal(readSchoolConfig(env, process.cwd()).key.length, 32);
  for (const bad of [
    {},
    { ...env, WAGGLE_SETTINGS_ENCRYPTION_KEY: "short" },
    { ...env, BETTER_AUTH_SECRET: env.WAGGLE_SETTINGS_ENCRYPTION_KEY },
    { ...env, WAGGLE_SETTINGS_DATABASE_PATH: ".data/auth.sqlite" },
    { ...env, WAGGLE_SETTINGS_DATABASE_PATH: "public/school.sqlite" },
    { ...env, WAGGLE_SETTINGS_DATABASE_PATH: ".next/school.sqlite" },
  ])
    assert.throws(() => readSchoolConfig(bad, process.cwd()), /unavailable/);
});
test("키 준비 명령은 기존 인증 값·기존 암호화 키를 보존한다", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "waggle-school-env-"));
  try {
    const filename = path.join(dir, ".env.local");
    const original =
      "BETTER_AUTH_SECRET=synthetic-existing-secret\nDATAGSM_CLIENT_ID=synthetic-client\n";
    await writeFile(filename, original);
    assert.equal(await initializeSchoolEnv(filename), true);
    const first = await readFile(filename, "utf8");
    assert.ok(first.startsWith(original));
    assert.match(first, /WAGGLE_SETTINGS_ENCRYPTION_KEY=[a-f0-9]{64}/);
    assert.equal(await initializeSchoolEnv(filename), false);
    assert.equal(await readFile(filename, "utf8"), first);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(dir, { recursive: true, force: true });
  }
});
