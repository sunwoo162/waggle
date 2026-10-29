import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { genericOAuth } from "better-auth/plugins";
import type Database from "better-sqlite3";
import type { AuthSettings } from "./config";
import { createDataGsmProvider } from "./datagsm";

export function createDataGsmAuth({
  settings,
  database,
  fetcher = fetch,
}: {
  settings: AuthSettings;
  database: Database.Database;
  fetcher?: typeof fetch;
}) {
  return betterAuth({
    appName: "와글",
    baseURL: settings.baseURL,
    basePath: "/api/auth",
    secret: settings.secret,
    database,
    trustedOrigins: [settings.baseURL],
    logger: { disabled: true },
    onAPIError: { errorURL: `${settings.baseURL}/sign-in` },
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: {
      useSecureCookies: settings.baseURL.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    user: {
      validateUserInfo({ source }) {
        if (
          source.method !== "oauth" ||
          source.oauth?.providerId !== "datagsm" ||
          source.oauth.profile?.id !== settings.operatorSubject ||
          source.oauth.profile?.status !== "ACTIVE"
        ) {
          return {
            error: "operator_not_allowed",
            errorDescription: "운영자로 지정된 계정으로 로그인해주세요.",
          };
        }
      },
    },
    plugins: [genericOAuth({ config: [createDataGsmProvider(settings, fetcher)] })],
  });
}

export type WaggleAuth = ReturnType<typeof createDataGsmAuth>;

export async function migrateAuth(options: WaggleAuth["options"]) {
  const migration = await getMigrations(options);
  if (migration.unsafeChanges.length || migration.schemaProblems.length)
    throw new Error("auth_migration_requires_review");
  await migration.runMigrations();
}
