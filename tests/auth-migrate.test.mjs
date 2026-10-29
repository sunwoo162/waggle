import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("실제 마이그레이션 CLI가 설정 누락을 안전한 안내로 처리한다", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "apps/admin/scripts/migrate-auth.mts"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "",
        DATAGSM_CLIENT_ID: "",
        WAGGLE_ADMIN_DATAGSM_ID: "",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /인증 설정을 먼저 준비/);
  assert.match(output, /DATAGSM_CLIENT_ID/);
  assert.ok(!output.includes("SyntaxError"));
});
