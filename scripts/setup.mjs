import { execFileSync } from "node:child_process";

execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], { stdio: "inherit" });
console.log("와글 커밋 훅을 이 저장소에 설치했습니다. npm run check로 전체 검사를 실행하세요.");
