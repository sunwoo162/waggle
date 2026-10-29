import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AccessPoint, Network, SchoolSnapshot, Security } from "../../shared/school";
import { securityOptions } from "../../shared/school";
import { CredentialCipher } from "./crypto";
import { invalid, SchoolError, unavailable } from "./errors";

const keyMarker = "waggle-school-storage-v1";
function verify(database: Database.Database, cipher: CredentialCipher) {
  if (database.pragma("user_version", { simple: true }) !== 1) unavailable();
  const row = database.prepare("SELECT key_check FROM school_meta WHERE id=1").get() as
    | { key_check: string }
    | undefined;
  if (!row || cipher.open(row.key_check, "key-check") !== keyMarker) unavailable();
}
export function migrateSchoolDatabase(database: Database.Database, key: Buffer) {
  const cipher = new CredentialCipher(key);
  database.pragma("foreign_keys = ON");
  database
    .transaction(() => {
      const version = database.pragma("user_version", { simple: true });
      if (version === 1) {
        verify(database, cipher);
        return;
      }
      if (
        version !== 0 ||
        database
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all().length
      )
        unavailable();
      database.exec(`
      CREATE TABLE school_meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, key_check TEXT NOT NULL);
      CREATE TABLE school_network (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, ssid TEXT NOT NULL,
        security TEXT NOT NULL CHECK(security IN ('open','wpa2-personal','wpa3-personal')),
        credential TEXT, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        revision INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE school_ap (
        id TEXT PRIMARY KEY, network_id TEXT NOT NULL REFERENCES school_network(id),
        name TEXT NOT NULL, bssid TEXT NOT NULL UNIQUE, building TEXT NOT NULL,
        floor TEXT NOT NULL, place TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        revision INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX school_ap_network ON school_ap(network_id);
      PRAGMA user_version=1;
    `);
      database
        .prepare("INSERT INTO school_meta VALUES (1,0,?)")
        .run(cipher.seal(keyMarker, "key-check"));
    })
    .immediate();
}
function object(input: unknown, fields: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("form", "입력 형식이 올바르지 않습니다.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !fields.includes(key)))
    invalid("form", "허용되지 않은 입력 항목입니다.");
  return value;
}
function hasInvalidText(value: string) {
  return (
    Buffer.from(value, "utf8").toString("utf8") !== value ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}
function text(value: unknown, field: string, max: number, optional = false): string {
  if (typeof value !== "string") invalid(field, "문자열을 입력해주세요.");
  const normalized = value.trim();
  if ((!optional && !normalized) || normalized.length > max || hasInvalidText(normalized))
    invalid(field, "입력 길이와 문자를 확인해주세요.");
  return normalized;
}
function enabled(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("enabled", "사용 여부를 선택해주세요.");
  return value;
}
function revision(value: unknown, updating: boolean): number {
  if (!updating) {
    if (value !== undefined) invalid("revision", "새 항목에는 수정 버전을 지정하지 않습니다.");
    return 0;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    invalid("revision", "수정 버전이 필요합니다.");
  return value;
}
function checkRevision(old: { revision: number } | undefined, expected: number) {
  if (!old) throw new SchoolError("not_found", "항목을 찾을 수 없습니다.");
  if (old.revision !== expected)
    throw new SchoolError(
      "conflict",
      "다른 곳에서 수정된 항목입니다. 최신 정보를 불러온 뒤 다시 수정해주세요.",
    );
}

export class SchoolStore {
  private readonly cipher: CredentialCipher;
  constructor(
    private readonly database: Database.Database,
    key: Buffer,
  ) {
    this.cipher = new CredentialCipher(key);
    verify(database, this.cipher);
  }
  snapshot(): SchoolSnapshot {
    return this.database.transaction(() => {
      const meta = this.database.prepare("SELECT version FROM school_meta WHERE id=1").get() as {
        version: number;
      };
      const networks = this.database
        .prepare(`SELECT n.id,n.name,n.ssid,n.security,n.enabled,n.revision,
        n.updated_at AS updatedAt, n.credential IS NOT NULL AS hasPassword, COUNT(a.id) AS apCount
        FROM school_network n LEFT JOIN school_ap a ON a.network_id=n.id GROUP BY n.id ORDER BY n.name,n.id`)
        .all() as (Omit<Network, "enabled" | "hasPassword"> & {
        enabled: number;
        hasPassword: number;
      })[];
      const accessPoints = this.database
        .prepare(`SELECT a.id,a.network_id AS networkId,a.name,a.bssid,a.building,a.floor,a.place,
        a.enabled,a.revision,a.updated_at AS updatedAt, (a.enabled=1 AND n.enabled=1) AS effectiveEnabled
        FROM school_ap a JOIN school_network n ON n.id=a.network_id ORDER BY a.building,a.floor,a.name,a.id`)
        .all() as (Omit<AccessPoint, "enabled" | "effectiveEnabled" | "locationRegistered"> & {
        enabled: number;
        effectiveEnabled: number;
      })[];
      return {
        version: meta.version,
        networks: networks.map((n) => ({
          ...n,
          enabled: Boolean(n.enabled),
          hasPassword: Boolean(n.hasPassword),
        })),
        accessPoints: accessPoints.map((a) => ({
          ...a,
          enabled: Boolean(a.enabled),
          effectiveEnabled: Boolean(a.effectiveEnabled),
          locationRegistered: Boolean(a.building && a.floor && a.place),
        })),
      };
    })();
  }
  saveNetwork(input: unknown, id?: string): Network {
    const v = object(input, ["name", "ssid", "security", "password", "enabled", "revision"]);
    const name = text(v.name, "name", 80);
    if (
      typeof v.ssid !== "string" ||
      !v.ssid ||
      Buffer.byteLength(v.ssid, "utf8") > 32 ||
      hasInvalidText(v.ssid)
    )
      invalid("ssid", "SSID는 정확한 이름으로 1~32바이트를 입력해주세요.");
    if (!securityOptions.some((s) => s.value === v.security))
      invalid("security", "지원하는 보안 방식을 선택해주세요.");
    const security = v.security as Security;
    const active = enabled(v.enabled);
    const expected = revision(v.revision, Boolean(id));
    if (typeof v.password !== "string") invalid("password", "비밀번호 입력 형식을 확인해주세요.");
    const password = v.password;
    if (security === "open" && password)
      invalid("password", "OPEN 네트워크에는 비밀번호를 입력하지 않습니다.");
    if (
      password &&
      security !== "open" &&
      !(
        /^[\x20-\x7e]{8,63}$/.test(password) ||
        (security === "wpa2-personal" && /^[0-9a-fA-F]{64}$/.test(password))
      )
    )
      invalid(
        "password",
        "개인용 암호는 영문·숫자·기호 8~63자, WPA2 키는 64자리 16진수로 입력해주세요.",
      );
    const networkId = id || randomUUID();
    return this.database
      .transaction(() => {
        const old = id
          ? (this.database
              .prepare("SELECT revision,credential,security FROM school_network WHERE id=?")
              .get(id) as
              | { revision: number; credential: string | null; security: Security }
              | undefined)
          : undefined;
        if (id) checkRevision(old, expected);
        if (security !== "open" && !password && (!old?.credential || old.security !== security))
          invalid("password", "새 연결 정보 또는 보안 방식 변경에는 비밀번호가 필요합니다.");
        const credential =
          security === "open"
            ? null
            : password
              ? this.cipher.seal(password, `network:${networkId}`)
              : old?.credential;
        this.database
          .prepare(`INSERT INTO school_network VALUES (@id,@name,@ssid,@security,@credential,@enabled,@revision,@updatedAt)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,ssid=excluded.ssid,security=excluded.security,credential=excluded.credential,enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at`)
          .run({
            id: networkId,
            name,
            ssid: v.ssid,
            security,
            credential,
            enabled: Number(active),
            revision: expected + 1,
            updatedAt: new Date().toISOString(),
          });
        this.database.prepare("UPDATE school_meta SET version=version+1 WHERE id=1").run();
        const saved = this.snapshot().networks.find((n) => n.id === networkId);
        if (!saved) return unavailable();
        return saved;
      })
      .immediate();
  }
  saveAccessPoint(input: unknown, id?: string): AccessPoint {
    const v = object(input, [
      "networkId",
      "name",
      "bssid",
      "building",
      "floor",
      "place",
      "enabled",
      "revision",
    ]);
    const networkId = text(v.networkId, "networkId", 80);
    const name = text(v.name, "name", 80);
    const bssid = text(v.bssid, "bssid", 17).toLowerCase().replaceAll("-", ":");
    if (
      !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(bssid) ||
      Number.parseInt(bssid.slice(0, 2), 16) & 1 ||
      bssid === "00:00:00:00:00:00"
    )
      invalid("bssid", "유효한 AP BSSID를 입력해주세요.");
    const building = text(v.building, "building", 80, true);
    const floor = text(v.floor, "floor", 24, true);
    const place = text(v.place, "place", 120, true);
    const active = enabled(v.enabled);
    const expected = revision(v.revision, Boolean(id));
    const apId = id || randomUUID();
    return this.database
      .transaction(() => {
        if (id)
          checkRevision(
            this.database.prepare("SELECT revision FROM school_ap WHERE id=?").get(id) as
              | { revision: number }
              | undefined,
            expected,
          );
        if (!this.database.prepare("SELECT id FROM school_network WHERE id=?").get(networkId))
          invalid("networkId", "등록된 네트워크를 선택해주세요.");
        if (
          this.database.prepare("SELECT id FROM school_ap WHERE bssid=? AND id<>?").get(bssid, apId)
        )
          throw new SchoolError("conflict", "이미 등록된 BSSID입니다.", "bssid");
        this.database
          .prepare(`INSERT INTO school_ap VALUES (@id,@networkId,@name,@bssid,@building,@floor,@place,@enabled,@revision,@updatedAt)
        ON CONFLICT(id) DO UPDATE SET network_id=excluded.network_id,name=excluded.name,bssid=excluded.bssid,building=excluded.building,floor=excluded.floor,place=excluded.place,enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at`)
          .run({
            id: apId,
            networkId,
            name,
            bssid,
            building,
            floor,
            place,
            enabled: Number(active),
            revision: expected + 1,
            updatedAt: new Date().toISOString(),
          });
        this.database.prepare("UPDATE school_meta SET version=version+1 WHERE id=1").run();
        const saved = this.snapshot().accessPoints.find((a) => a.id === apId);
        if (!saved) return unavailable();
        return saved;
      })
      .immediate();
  }
}
