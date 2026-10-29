import "server-only";
import { openAuthDatabase as openPrivateDatabase } from "../auth/database";
import { readSchoolConfig } from "./config";
import { unavailable } from "./errors";
import { SchoolStore } from "./store";

let runtime: { store: SchoolStore; signature: string } | undefined;
export function getSchoolStore() {
  const config = readSchoolConfig(process.env, process.cwd());
  const signature = JSON.stringify([config.filename, config.key.toString("hex")]);
  if (runtime) {
    if (runtime.signature !== signature) return unavailable();
    return runtime.store;
  }
  const database = openPrivateDatabase(config.filename);
  try {
    const store = new SchoolStore(database, config.key);
    runtime = { store, signature };
    return store;
  } catch {
    database.close();
    return unavailable();
  }
}
export function getSchoolState() {
  try {
    return { ready: true as const, snapshot: getSchoolStore().snapshot() };
  } catch {
    return { ready: false as const };
  }
}
