import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Collection } from "../../shared/encyclopedia";
import type { InviteMember, IssuedInvite, MemberSnapshot, TokenPair } from "../../shared/members";
import { denied, MemberError, memberInvalid } from "./errors";
import { assertMemberSchema, type MemberAuth, type MemberSettings } from "./factory";

type MemberRow = {
  id: string;
  selector: string;
  user_id: string;
  alias: string;
  code_hash: string;
  code_version: number;
  code_active: number;
  revision: number;
  created_at: number;
  issued_at: number;
};
type DeviceRow = {
  id: string;
  member_id: string;
  auth_session_id: string;
  code_version: number;
  platform: "android" | "windows";
  name: string;
  created_at: number;
  refreshed_at: number;
  expires_at: number;
  revoked_at: number | null;
};
const lifetime = 30 * 24 * 60 * 60 * 1000;
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    Buffer.from(value, "utf8").toString("utf8") !== value ||
    Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return memberInvalid();
  return value.trim();
}
export class MemberService {
  constructor(
    private readonly db: Database.Database,
    private readonly auth: MemberAuth,
    settings: MemberSettings,
    private readonly now: () => number = Date.now,
  ) {
    assertMemberSchema(db, settings);
  }
  snapshot(): MemberSnapshot {
    return this.db.transaction(() => {
      const members = this.db
        .prepare("SELECT * FROM native_member ORDER BY alias,id")
        .all() as MemberRow[];
      const devices = this.db
        .prepare("SELECT * FROM native_device ORDER BY created_at DESC,id")
        .all() as DeviceRow[];
      return {
        members: members.map((m) => ({
          id: m.id,
          alias: m.alias,
          revision: m.revision,
          codeActive: Boolean(m.code_active),
          createdAt: m.created_at,
          issuedAt: m.issued_at,
          devices: devices
            .filter((d) => d.member_id === m.id)
            .map((d) => ({
              id: d.id,
              platform: d.platform,
              name: d.name,
              createdAt: d.created_at,
              refreshedAt: d.refreshed_at,
              expiresAt: d.expires_at,
              status:
                d.revoked_at !== null || !m.code_active || d.code_version !== m.code_version
                  ? ("revoked" as const)
                  : d.expires_at <= this.now()
                    ? ("expired" as const)
                    : ("active" as const),
            })),
        })),
      };
    })();
  }
  private member(id: string) {
    return this.db.prepare("SELECT * FROM native_member WHERE id=?").get(id) as
      | MemberRow
      | undefined;
  }
  private revision(id: string, expected: unknown) {
    if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 1)
      return memberInvalid();
    const m = this.member(id);
    if (!m || m.revision !== expected)
      throw new MemberError(
        "conflict",
        "목록이 변경됐습니다. 최신 정보를 불러온 뒤 다시 시도해주세요.",
      );
    return m;
  }
  private live(sessionId: string) {
    const device = this.db
      .prepare("SELECT * FROM native_device WHERE auth_session_id=?")
      .get(sessionId) as DeviceRow | undefined;
    if (!device || device.revoked_at !== null || device.expires_at <= this.now()) return denied();
    const member = this.member(device.member_id);
    if (!member?.code_active || member.code_version !== device.code_version) return denied();
    return { member, device };
  }
  private limit(bucket: string, max: number, window: number) {
    this.db
      .transaction(() => {
        const now = this.now();
        const row = this.db
          .prepare("SELECT starts_at,count FROM native_limit WHERE bucket=?")
          .get(bucket) as { starts_at: number; count: number } | undefined;
        if (row && now - row.starts_at < window && row.count >= max)
          throw new MemberError("rate_limited", "요청이 많습니다. 잠시 후 다시 시도해주세요.");
        this.db
          .prepare(
            "INSERT INTO native_limit VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET starts_at=excluded.starts_at,count=?",
          )
          .run(
            bucket,
            row && now - row.starts_at < window ? row.starts_at : now,
            row && now - row.starts_at < window ? row.count + 1 : 1,
          );
      })
      .immediate();
  }
  private async drop(token: string) {
    try {
      await this.auth.api.dropDeviceGrant({ body: { token } });
    } catch {
      /* Metadata already denies this grant. */
    }
  }
  private dto(id: string): InviteMember {
    const member = this.snapshot().members.find((m) => m.id === id);
    if (!member) return denied();
    return member;
  }
  async issue(alias: unknown): Promise<IssuedInvite> {
    const label = text(alias, 80);
    const id = randomUUID();
    const selector = randomBytes(8).toString("hex");
    const secret = randomBytes(24).toString("base64url");
    const { hash } = await this.auth.api.hashInviteSecret({ body: { secret } });
    const user = await this.auth.api.createInviteIdentity({
      body: { alias: label, email: `${id}@invite.waggle.invalid` },
    });
    try {
      this.db
        .transaction(() => {
          this.db
            .prepare("INSERT INTO native_member VALUES (?,?,?,?,?,1,1,1,?,?)")
            .run(id, selector, user.id, label, hash, this.now(), this.now());
        })
        .immediate();
    } catch (error) {
      await this.auth.api.dropInviteIdentity({ body: { userId: user.id } }).catch(() => {});
      throw error;
    }
    return { member: this.dto(id), code: `WG.${selector}.${secret}` };
  }
  async reissue(id: string, expected: unknown): Promise<IssuedInvite> {
    this.revision(id, expected);
    const secret = randomBytes(24).toString("base64url");
    const { hash } = await this.auth.api.hashInviteSecret({ body: { secret } });
    const selector = this.db
      .transaction(() => {
        const member = this.revision(id, expected);
        this.db
          .prepare(
            "UPDATE native_member SET code_hash=?,code_version=code_version+1,code_active=1,revision=revision+1,issued_at=? WHERE id=?",
          )
          .run(hash, this.now(), id);
        this.db
          .prepare("UPDATE native_device SET revoked_at=? WHERE member_id=? AND revoked_at IS NULL")
          .run(this.now(), id);
        return member.selector;
      })
      .immediate();
    return { member: this.dto(id), code: `WG.${selector}.${secret}` };
  }
  async revoke(id: string, expected: unknown) {
    this.db
      .transaction(() => {
        this.revision(id, expected);
        this.db
          .prepare(
            "UPDATE native_member SET code_active=0,code_version=code_version+1,revision=revision+1 WHERE id=?",
          )
          .run(id);
        this.db
          .prepare("UPDATE native_device SET revoked_at=? WHERE member_id=? AND revoked_at IS NULL")
          .run(this.now(), id);
      })
      .immediate();
  }
  async revokeDevice(memberId: string, deviceId: string, expected: unknown) {
    this.db
      .transaction(() => {
        this.revision(memberId, expected);
        if (
          !this.db
            .prepare("SELECT id FROM native_device WHERE member_id=? AND id=?")
            .get(memberId, deviceId)
        )
          return denied();
        this.db
          .prepare("UPDATE native_device SET revoked_at=? WHERE id=? AND member_id=?")
          .run(this.now(), deviceId, memberId);
        this.db.prepare("UPDATE native_member SET revision=revision+1 WHERE id=?").run(memberId);
      })
      .immediate();
  }
  private async pair(
    session: { id: string; token: string; userId: string },
    device: DeviceRow,
  ): Promise<TokenPair> {
    const { token } = await this.auth.api.signJWT({
      body: {
        payload: {
          sub: session.userId,
          sid: session.id,
          type: "access",
          iat: Math.floor(Date.now() / 1000),
        },
      },
    });
    this.live(session.id);
    return {
      accessToken: token,
      refreshToken: session.token,
      tokenType: "Bearer",
      accessExpiresIn: 900,
      refreshExpiresAt: device.expires_at,
    };
  }
  async login(input: {
    code: unknown;
    platform: unknown;
    deviceName: unknown;
  }): Promise<TokenPair> {
    const name = text(input.deviceName, 64);
    if (typeof input.platform !== "string" || !["android", "windows"].includes(input.platform))
      return memberInvalid();
    this.limit("code-login", 120, 60_000);
    const parsed =
      typeof input.code === "string"
        ? input.code.trim().match(/^WG\.([a-f0-9]{16})\.([A-Za-z0-9_-]{32})$/)
        : null;
    const member = parsed
      ? (this.db.prepare("SELECT * FROM native_member WHERE selector=?").get(parsed[1]) as
          | MemberRow
          | undefined)
      : undefined;
    this.limit(member ? `selector:${member.id}` : "selector:unknown", 10, 300_000);
    if (!parsed || !member?.code_active) return denied();
    const result = await this.auth.api.verifyInviteSecret({
      body: { hash: member.code_hash, secret: parsed[2] },
    });
    if (!result.valid) return denied();
    const session = await this.auth.api.createDeviceGrant({ body: { userId: member.user_id } });
    try {
      const device = this.db
        .transaction(() => {
          const current = this.member(member.id);
          if (!current?.code_active || current.code_version !== member.code_version)
            return denied();
          const count = this.db
            .prepare(
              "SELECT COUNT(*) AS count FROM native_device WHERE member_id=? AND revoked_at IS NULL AND expires_at>?",
            )
            .get(member.id, this.now()) as { count: number };
          if (count.count >= 20)
            throw new MemberError(
              "conflict",
              "활성 기기가 많습니다. 사용하지 않는 기기 세션을 회수해주세요.",
            );
          const now = this.now();
          const id = randomUUID();
          this.db
            .prepare(
              "INSERT INTO native_device (id,member_id,auth_session_id,code_version,platform,name,created_at,refreshed_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .run(
              id,
              member.id,
              session.id,
              member.code_version,
              input.platform,
              name,
              now,
              now,
              Math.min(now + lifetime, new Date(session.expiresAt).getTime()),
            );
          return this.live(session.id).device;
        })
        .immediate();
      return await this.pair(session, device);
    } catch (error) {
      this.db.prepare("DELETE FROM native_device WHERE auth_session_id=?").run(session.id);
      await this.drop(session.token);
      throw error;
    }
  }
  private async refreshIdentity(token: unknown) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) return denied();
    const session = await this.auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    if (!session) return denied();
    const value = this.live(session.session.id);
    if (value.member.user_id !== session.user.id) return denied();
    return { ...value, session: session.session };
  }
  async refresh(token: unknown): Promise<TokenPair> {
    this.limit("refresh", 120, 60_000);
    const old = await this.refreshIdentity(token);
    const next = await this.auth.api.createDeviceGrant({ body: { userId: old.member.user_id } });
    try {
      const device = this.db
        .transaction(() => {
          const current = this.live(old.session.id);
          if (current.device.id !== old.device.id) return denied();
          const changed = this.db
            .prepare(
              "UPDATE native_device SET auth_session_id=?,refreshed_at=? WHERE id=? AND auth_session_id=? AND revoked_at IS NULL",
            )
            .run(next.id, this.now(), old.device.id, old.session.id);
          if (changed.changes !== 1) return denied();
          return this.live(next.id).device;
        })
        .immediate();
      const pair = await this.pair(next, device);
      await this.drop(old.session.token);
      return pair;
    } catch (error) {
      // Restore only our unfinished rotation; never undo a concurrent revocation.
      this.db
        .prepare(`UPDATE native_device SET auth_session_id=?,refreshed_at=?
        WHERE id=? AND auth_session_id=? AND revoked_at IS NULL AND expires_at>?
        AND EXISTS (SELECT 1 FROM native_member m WHERE m.id=native_device.member_id
          AND m.code_active=1 AND m.code_version=native_device.code_version)`)
        .run(old.session.id, old.device.refreshed_at, old.device.id, next.id, this.now());
      await this.drop(next.token);
      throw error;
    }
  }
  async access(token: unknown) {
    if (typeof token !== "string" || token.length > 8192) return denied();
    const { payload } = await this.auth.api.verifyJWT({ body: { token } });
    if (
      payload?.type !== "access" ||
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string"
    )
      return denied();
    const raw = this.db.prepare('SELECT token FROM "session" WHERE id=?').get(payload.sid) as
      | { token: string }
      | undefined;
    if (!raw) return denied();
    const identity = await this.refreshIdentity(raw.token);
    if (identity.member.user_id !== payload.sub) return denied();
    return {
      member: { id: identity.member.id, alias: identity.member.alias },
      device: {
        id: identity.device.id,
        platform: identity.device.platform,
        name: identity.device.name,
        expiresAt: identity.device.expires_at,
      },
      userId: identity.member.user_id,
      sessionId: identity.session.id,
    };
  }
  async logout(token: unknown) {
    try {
      const identity = await this.refreshIdentity(token);
      this.db
        .prepare("UPDATE native_device SET revoked_at=? WHERE id=?")
        .run(this.now(), identity.device.id);
      await this.drop(identity.session.token);
    } catch (error) {
      if (!(error instanceof MemberError) || error.code !== "unauthorized") throw error;
    }
  }
  async configAccess(token: unknown) {
    const identity = await this.access(token);
    this.limit(`config:${identity.device.id}`, 12, 300_000);
    return identity;
  }
  async collectionAccess(token: unknown) {
    const identity = await this.access(token);
    this.limit(`collection:${identity.device.id}`, 60, 300_000);
    return identity;
  }
  mergeCollection(
    identity: Awaited<ReturnType<MemberService["access"]>>,
    apIds: string[] = [],
  ): Collection {
    if (
      apIds.length > 100 ||
      apIds.some(
        (id) =>
          typeof id !== "string" ||
          id.length !== 36 ||
          !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id),
      )
    )
      return memberInvalid();
    return this.db
      .transaction(() => {
        const current = this.live(identity.sessionId);
        if (current.member.id !== identity.member.id) return denied();
        const insert = this.db.prepare("INSERT OR IGNORE INTO native_collection VALUES (?,?)");
        for (const apId of new Set(apIds)) insert.run(current.member.id, apId);
        const rows = this.db
          .prepare(
            "SELECT ap_id FROM native_collection WHERE member_id=? ORDER BY ap_id LIMIT 10001",
          )
          .all(current.member.id) as { ap_id: string }[];
        if (rows.length > 10000)
          throw new MemberError(
            "conflict",
            "도감 수집 한도에 도달했습니다. 운영자에게 문의해주세요.",
          );
        return { schemaVersion: 1 as const, apIds: rows.map((row) => row.ap_id) };
      })
      .immediate();
  }
}
