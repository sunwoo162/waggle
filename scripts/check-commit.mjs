import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function verifyCommitMessage(message) {
  const title = message.split(/\r?\n/)[0].trim();
  return (
    /^(?:feat|fix|docs|style|refactor|test|chore|ci|build|perf|revert)(?:\([a-z0-9-]+\))?!?: \S.+$/u.test(
      title,
    ) ||
    /^Merge (?:branch |pull request #)/.test(title) ||
    /^Revert ".+"$/.test(title)
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !verifyCommitMessage(readFileSync(process.argv[2], "utf8"))) {
    console.error("커밋 제목: feat(admin): 문서 메뉴 추가 형태로 작성해주세요.");
    process.exitCode = 1;
  }
}
