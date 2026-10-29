import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function initializeAuthEnv(file) {
  const content = [
    "BETTER_AUTH_URL=http://localhost:3000",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
    "DATAGSM_CLIENT_ID=",
    "WAGGLE_ADMIN_DATAGSM_ID=",
    "",
  ].join("\n");
  try {
    await writeFile(file, content, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = fileURLToPath(new URL("../apps/admin/.env.local", import.meta.url));
  const created = await initializeAuthEnv(file);
  console.log(
    created
      ? "apps/admin/.env.local을 준비했습니다. DataGSM 클라이언트 ID와 운영자 ID를 직접 입력하세요. 비밀값은 출력하지 않습니다."
      : "기존 apps/admin/.env.local을 보존했습니다.",
  );
}
