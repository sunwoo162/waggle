import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { openAuthDatabase as openPrivateDatabase } from "../src/server/auth/database";
import { readSchoolConfig } from "../src/server/school/config";
import { rotateSchoolKey } from "../src/server/school/store";

// Stop the admin server first. Put the new 64-hex key in WAGGLE_SETTINGS_NEXT_KEY, run this once,
// then replace WAGGLE_SETTINGS_ENCRYPTION_KEY with the new key and remove WAGGLE_SETTINGS_NEXT_KEY.
// Keys are never printed.
const root = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(root);
try {
  const current = readSchoolConfig(process.env, root);
  const next = process.env.WAGGLE_SETTINGS_NEXT_KEY;
  if (!next || !/^[a-fA-F0-9]{64}$/.test(next) || next === process.env.BETTER_AUTH_SECRET)
    throw new Error("next_key");
  const database = openPrivateDatabase(current.filename);
  try {
    rotateSchoolKey(database, current.key, Buffer.from(next, "hex"));
  } finally {
    database.close();
  }
  console.log(
    "학교 설정 암호문을 새 키로 바꿨습니다. 이제 WAGGLE_SETTINGS_ENCRYPTION_KEY를 새 키로 교체하고 WAGGLE_SETTINGS_NEXT_KEY를 지운 뒤 서버를 시작하세요.",
  );
} catch {
  console.error(
    "키를 교체하지 못했습니다. 현재 키·새 키(64자리 16진수, 현재 키와 달라야 함)와 저장 경로를 확인해주세요. 저장소는 바뀌지 않았습니다.",
  );
  process.exitCode = 1;
}
