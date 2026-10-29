import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeAuthEnv } from "../scripts/setup-auth.mjs";

test("기존 환경 파일과 자격증명을 덮어쓰지 않는다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "waggle-auth-env-"));
  try {
    const file = path.join(root, ".env.local");
    const original = "DATAGSM_CLIENT_ID=existing-fixture\n";
    await writeFile(file, original);
    assert.equal(await initializeAuthEnv(file), false);
    assert.equal(await readFile(file, "utf8"), original);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});

test("비밀값을 출력하지 않고 서로 다른 로컬 키를 만든다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "waggle-auth-env-"));
  try {
    const first = path.join(root, "first.env");
    const second = path.join(root, "second.env");
    assert.equal(await initializeAuthEnv(first), true);
    assert.equal(await initializeAuthEnv(second), true);
    const a = await readFile(first, "utf8");
    const b = await readFile(second, "utf8");
    assert.match(a, /^BETTER_AUTH_SECRET=[A-Za-z0-9_-]{43}$/m);
    assert.notEqual(
      a.match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1],
      b.match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1],
    );
    assert.match(a, /^DATAGSM_CLIENT_ID=$/m);
    assert.match(a, /^WAGGLE_ADMIN_DATAGSM_ID=$/m);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
