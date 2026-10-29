import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { readAuthConfig } from "../src/server/auth/config";
import { openAuthDatabase } from "../src/server/auth/database";
import { createDataGsmAuth, migrateAuth } from "../src/server/auth/factory";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(appRoot);
const config = readAuthConfig(process.env);
if (!config.ready) {
  console.error("인증 설정을 먼저 준비해주세요.", [...config.missing, ...config.errors].join("\n"));
  process.exitCode = 1;
} else {
  const database = openAuthDatabase(
    path.resolve(appRoot, process.env.WAGGLE_AUTH_DATABASE_PATH || ".data/auth.sqlite"),
  );
  try {
    const auth = createDataGsmAuth({ settings: config.settings, database });
    await migrateAuth(auth.options);
    console.log("와글 인증 스키마 준비 완료. 실제 DataGSM 로그인 검증은 별도로 진행하세요.");
  } catch {
    console.error("인증 스키마를 준비하지 못했습니다. 저장소와 마이그레이션 상태를 확인해주세요.");
    process.exitCode = 1;
  } finally {
    database.close();
  }
}
