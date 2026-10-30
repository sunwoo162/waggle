import assert from "node:assert/strict";
import test from "node:test";
import { verifyCommitMessage } from "../scripts/check-commit.mjs";
import { findRepositoryProblems } from "../scripts/check-repo.mjs";

test("비밀 파일과 실제 자격증명 모양을 차단한다", () => {
  const problems = findRepositoryProblems([
    { path: ".env.local", content: "EXAMPLE=example" },
    { path: "config/key.pem", content: "-----BEGIN " + "PRIVATE KEY-----" },
    { path: "src/config.ts", content: `${["gh", "p_"].join("")}${"a".repeat(36)}` },
  ]);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((value) => value.includes(".env.local")));
  assert.ok(problems.some((value) => value.includes("src/config.ts")));
});

test("문서와 빈 환경 예시는 허용한다", () => {
  assert.deepEqual(
    findRepositoryProblems([
      { path: "apps/admin/.env.example", content: "DATAGSM_CLIENT_ID=\n" },
      { path: "docs/auth.md", content: "client_secret은 서버에서 보관한다." },
    ]),
    [],
  );
});

test("DB·키 저장소·생성 출력이 커밋에 섞이지 않는다", () => {
  for (const path of [
    "data/school.sqlite",
    "release/signing.jks",
    "a/.env",
    "node_modules/pkg/index.js",
    ".tools/dotnet/dotnet.exe",
    "apps/windows/Waggle.Windows/bin/Release/Waggle.exe",
    "apps/windows/Waggle.Windows/obj/project.assets.json",
  ]) {
    assert.equal(findRepositoryProblems([{ path, content: "" }]).length, 1, path);
  }
});

test("의미 있는 Conventional Commit과 Git 기본 메시지를 허용한다", () => {
  for (const message of [
    "feat(admin): 문서 메뉴 추가",
    "fix: 권한 실패 처리",
    "Merge pull request #1 from sunwoo162/feat/docs",
    'Revert "feat: 문서 추가"',
  ]) {
    assert.equal(verifyCommitMessage(message), true, message);
  }
  for (const message of ["", "update", "feat:", "chore: ", "hello: 변경"]) {
    assert.equal(verifyCommitMessage(message), false, message);
  }
});
