import "server-only";
import { openAuthDatabase as openPrivateDatabase } from "../auth/database";
import { readMemberConfig } from "./config";
import { memberUnavailable } from "./errors";
import { createMemberAuth } from "./factory";
import { MemberService } from "./service";

let runtime: { service: MemberService; signature: string } | undefined;
export function getMemberService() {
  const config = readMemberConfig(process.env, process.cwd());
  const signature = JSON.stringify(config);
  if (runtime) {
    if (runtime.signature !== signature) return memberUnavailable();
    return runtime.service;
  }
  const db = openPrivateDatabase(config.filename);
  try {
    const auth = createMemberAuth(config, db);
    const service = new MemberService(db, auth, config);
    runtime = { service, signature };
    return service;
  } catch {
    db.close();
    return memberUnavailable();
  }
}
export function getMemberState() {
  try {
    return { ready: true as const, snapshot: getMemberService().snapshot() };
  } catch {
    return { ready: false as const };
  }
}
