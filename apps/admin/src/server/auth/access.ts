import type Database from "better-sqlite3";
import type { WaggleAuth } from "./factory";
import { normalizeSubject } from "./policy";

export type AdminAccess =
  | { kind: "unconfigured" }
  | { kind: "unavailable" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "authorized"; user: { id: string; name: string } };

export async function authorizeAdmin(
  auth: WaggleAuth,
  database: Database.Database,
  headers: Headers,
  operatorSubject: string,
): Promise<AdminAccess> {
  const session = await auth.api.getSession({ headers });
  if (!session) return { kind: "unauthenticated" };
  const account = database
    .prepare('SELECT "accountId" FROM "account" WHERE "userId" = ? AND "providerId" = ?')
    .get(session.user.id, "datagsm") as { accountId: unknown } | undefined;
  const subject = normalizeSubject(account?.accountId);
  if (!subject || subject !== normalizeSubject(operatorSubject)) return { kind: "forbidden" };
  return { kind: "authorized", user: { id: session.user.id, name: session.user.name } };
}
