import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { openAuthDatabase as openPrivateDatabase } from "../src/server/auth/database";
import { readMemberConfig } from "../src/server/members/config";
import { createMemberAuth, migrateMembers } from "../src/server/members/factory";

const root = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(root);
try {
  const config = readMemberConfig(process.env, root);
  const db = openPrivateDatabase(config.filename);
  try {
    await migrateMembers(createMemberAuth(config, db), db, config);
  } finally {
    db.close();
  }
  console.log("개인 코드·기기 세션 스키마를 준비했습니다. 사용자나 코드를 발급하지 않았습니다.");
} catch {
  console.error(
    "사용자 인증 스키마를 준비하지 못했습니다. 기존 인증 키·저장 경로·스키마를 확인해주세요.",
  );
  process.exitCode = 1;
}
