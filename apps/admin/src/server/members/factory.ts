import { createHmac } from "node:crypto";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { bearer, jwt } from "better-auth/plugins";
import type Database from "better-sqlite3";
import { z } from "zod";
import { memberUnavailable } from "./errors";

export type MemberSettings = { baseURL: string; secret: string };
const nativeCore = () =>
  ({
    id: "waggle-native-core",
    endpoints: {
      hashInviteSecret: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ secret: z.string().length(32) }) },
        async (ctx) => ({ hash: await ctx.context.password.hash(ctx.body.secret) }),
      ),
      verifyInviteSecret: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ hash: z.string(), secret: z.string().length(32) }) },
        async (ctx) => ({
          valid: await ctx.context.password.verify({
            hash: ctx.body.hash,
            password: ctx.body.secret,
          }),
        }),
      ),
      createInviteIdentity: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ alias: z.string(), email: z.string() }) },
        async (ctx) =>
          ctx.context.internalAdapter.createUser(
            {
              name: ctx.body.alias,
              email: ctx.body.email,
              emailVerified: false,
            },
            { method: "waggle-invite" },
          ),
      ),
      dropInviteIdentity: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ userId: z.string() }) },
        async (ctx) => {
          await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
          return { ok: true };
        },
      ),
      createDeviceGrant: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ userId: z.string() }) },
        async (ctx) => {
          const session = await ctx.context.internalAdapter.createSession(ctx.body.userId, false);
          if (!session) return memberUnavailable();
          return session;
        },
      ),
      dropDeviceGrant: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ token: z.string() }) },
        async (ctx) => {
          await ctx.context.internalAdapter.deleteSession(ctx.body.token);
          return { ok: true };
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
export function createMemberAuth(settings: MemberSettings, database: Database.Database) {
  return betterAuth({
    appName: "와글 일반 사용자",
    baseURL: settings.baseURL,
    basePath: "/api/member-internal",
    secret: settings.secret,
    database,
    trustedOrigins: [settings.baseURL],
    logger: { disabled: true },
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: {
      cookiePrefix: "waggle-member",
      useSecureCookies: settings.baseURL.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    plugins: [
      nativeCore(),
      bearer(),
      jwt({
        disableSettingJwtHeader: true,
        jwks: { keyPairConfig: { alg: "EdDSA" }, disablePrivateKeyEncryption: false },
        jwt: {
          issuer: `${settings.baseURL}/api/client`,
          audience: "waggle-gsm-native",
          expirationTime: "15m",
          definePayload: ({ session }) => ({ sid: session.id, type: "access" }),
        },
      }),
    ],
  });
}
export type MemberAuth = ReturnType<typeof createMemberAuth>;
export function keyFingerprint(settings: MemberSettings) {
  return createHmac("sha256", settings.secret).update("waggle-members-schema-v1").digest("hex");
}
export function assertMemberSchema(
  database: Database.Database,
  settings: MemberSettings,
  expected = 2,
) {
  try {
    const meta = database
      .prepare("SELECT schema_version,key_check FROM native_meta WHERE id=1")
      .get() as { schema_version: number; key_check: string } | undefined;
    if (
      ![1, 2].includes(expected) ||
      meta?.schema_version !== expected ||
      meta.key_check !== keyFingerprint(settings)
    )
      memberUnavailable();
    for (const table of [
      "user",
      "session",
      "jwks",
      "native_member",
      "native_device",
      "native_limit",
      ...(expected === 2 ? ["native_collection"] : []),
    ])
      if (
        !database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
      )
        memberUnavailable();
  } catch {
    memberUnavailable();
  }
}
export async function migrateMembers(
  auth: MemberAuth,
  database: Database.Database,
  settings: MemberSettings,
) {
  if (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='native_meta'")
      .get()
  ) {
    const row = database.prepare("SELECT schema_version FROM native_meta WHERE id=1").get() as
      | { schema_version: number }
      | undefined;
    assertMemberSchema(database, settings, row?.schema_version);
  }
  const migration = await getMigrations(auth.options);
  if (migration.unsafeChanges.length || migration.schemaProblems.length) memberUnavailable();
  await migration.runMigrations();
  database.pragma("foreign_keys=ON");
  database
    .transaction(() => {
      database.exec(`
      CREATE TABLE IF NOT EXISTS native_meta (id INTEGER PRIMARY KEY CHECK(id=1),schema_version INTEGER NOT NULL,key_check TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS native_member (
        id TEXT PRIMARY KEY,selector TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL UNIQUE REFERENCES user(id),
        alias TEXT NOT NULL,code_hash TEXT NOT NULL,code_version INTEGER NOT NULL,code_active INTEGER NOT NULL,
        revision INTEGER NOT NULL,created_at INTEGER NOT NULL,issued_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS native_device (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES native_member(id),auth_session_id TEXT NOT NULL UNIQUE,
        code_version INTEGER NOT NULL,platform TEXT NOT NULL,name TEXT NOT NULL,created_at INTEGER NOT NULL,
        refreshed_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS native_device_member ON native_device(member_id);
      CREATE TABLE IF NOT EXISTS native_limit (bucket TEXT PRIMARY KEY,starts_at INTEGER NOT NULL,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS native_collection (
        member_id TEXT NOT NULL REFERENCES native_member(id),ap_id TEXT NOT NULL,
        PRIMARY KEY(member_id,ap_id)
      );
    `);
      database
        .prepare("INSERT OR IGNORE INTO native_meta VALUES (1,2,?)")
        .run(keyFingerprint(settings));
      database
        .prepare("UPDATE native_meta SET schema_version=2 WHERE id=1 AND schema_version=1")
        .run();
      assertMemberSchema(database, settings);
    })
    .immediate();
}
