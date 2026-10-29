import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function initializeSchoolEnv(file) {
  const original = await readFile(file, "utf8");
  const existing = original.match(/^WAGGLE_SETTINGS_ENCRYPTION_KEY=(.*)$/gm) || [];
  if (existing.length > 1) throw new Error("duplicate_settings_key");
  if (existing.length && existing[0].split("=").slice(1).join("=").trim()) return false;
  const line = `WAGGLE_SETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`;
  const content = existing.length
    ? original.replace(/^WAGGLE_SETTINGS_ENCRYPTION_KEY=.*$/m, line)
    : `${original}${original.endsWith("\n") ? "" : "\n"}${line}\n`;
  await writeFile(file, content, { mode: 0o600 });
  await chmod(file, 0o600);
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  initializeSchoolEnv(fileURLToPath(new URL("../apps/admin/.env.local", import.meta.url)))
    .then((created) => {
      console.log(
        created
          ? "학교 설정 암호화 키를 로컬 환경에 준비했습니다. 키는 출력하지 않습니다."
          : "기존 학교 설정 키를 보존했습니다.",
      );
    })
    .catch(() => {
      console.error(
        "키를 준비하지 못했습니다. auth:setup 실행 여부와 환경 파일의 중복 키를 확인해주세요.",
      );
      process.exitCode = 1;
    });
}
