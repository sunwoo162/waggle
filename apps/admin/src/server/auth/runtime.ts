import "server-only";
import path from "node:path";
import { type AdminAccess, authorizeAdmin } from "./access";
import { readAuthConfig } from "./config";
import { hasAuthSchema, openAuthDatabase } from "./database";
import { createDataGsmAuth } from "./factory";

let runtime:
  | {
      auth: ReturnType<typeof createDataGsmAuth>;
      database: ReturnType<typeof openAuthDatabase>;
      signature: string;
    }
  | undefined;

export async function getAuthRuntime() {
  const config = readAuthConfig(process.env);
  if (!config.ready) return null;
  const filename = path.resolve(
    /* turbopackIgnore: true */
    process.cwd(),
    process.env.WAGGLE_AUTH_DATABASE_PATH || ".data/auth.sqlite",
  );
  const signature = JSON.stringify([config.settings, filename]);
  if (runtime) {
    if (runtime.signature !== signature) throw new Error("auth_restart_required");
    return runtime;
  }
  const database = openAuthDatabase(filename);
  if (!hasAuthSchema(database)) {
    database.close();
    throw new Error("auth_migration_required");
  }
  runtime = {
    auth: createDataGsmAuth({ settings: config.settings, database }),
    database,
    signature,
  };
  return runtime;
}

export async function getAdminAccess(headers: Headers): Promise<AdminAccess> {
  const config = readAuthConfig(process.env);
  if (!config.ready) return { kind: "unconfigured" };
  try {
    const active = await getAuthRuntime();
    if (!active) return { kind: "unconfigured" };
    return await authorizeAdmin(
      active.auth,
      active.database,
      headers,
      config.settings.operatorSubject,
    );
  } catch {
    return { kind: "unavailable" };
  }
}
