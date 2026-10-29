import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { openAuthDatabase as openPrivateDatabase } from "../src/server/auth/database";
import { readSchoolConfig } from "../src/server/school/config";
import { migrateSchoolDatabase } from "../src/server/school/store";

const root = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(root);
try {
  const config = readSchoolConfig(process.env, root);
  const database = openPrivateDatabase(config.filename);
  try {
    migrateSchoolDatabase(database, config.key);
  } finally {
    database.close();
  }
  console.log("학교 설정 스키마를 준비했습니다. 실제 학교 연결 정보는 등록하지 않았습니다.");
} catch {
  console.error(
    "학교 설정 스키마를 준비하지 못했습니다. 암호화 키·저장 경로·기존 스키마를 확인해주세요.",
  );
  process.exitCode = 1;
}
