import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function findRepositoryProblems(files) {
  const problems = [];
  for (const { path: filename, content } of files) {
    const name = filename.replaceAll("\\", "/");
    const sensitive =
      /(^|\/)\.env(?:\..+)?$/.test(name) &&
      !name.endsWith("/.env.example") &&
      name !== ".env.example";
    const generated = /(^|\/)(node_modules|\.next|__pycache__|\.superpowers|_qa)\//.test(name);
    if (sensitive || generated || /\.(?:db|sqlite|sqlite3|jks|keystore|p12|pfx|pem)$/i.test(name)) {
      problems.push(`${name}: 비밀 파일 또는 생성 출력은 커밋할 수 없습니다.`);
      continue;
    }
    if (
      /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
        content,
      )
    ) {
      problems.push(`${name}: 자격증명 모양이 발견됐습니다. 원문을 출력하지 않습니다.`);
    }
  }
  return problems;
}

function main() {
  const staged = process.argv.includes("--staged");
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  const names = [
    ...new Set(execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean)),
  ];
  const files = names.map((name) => {
    const binary = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf)$/i.test(name);
    let content = "";
    if (!binary) {
      if (staged)
        content = execFileSync("git", ["show", `:${name}`], {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
      else content = readFileSync(name, "utf8");
    }
    return { path: name, content };
  });
  const problems = findRepositoryProblems(files);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else console.log(`Repository check passed (${files.length} files${staged ? ", staged" : ""}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
