import type Database from "better-sqlite3";
import type { CharacterSnapshot, Encyclopedia } from "../../shared/encyclopedia";
import { invalid, SchoolError, unavailable } from "./errors";
import { prepareCharacterArt } from "./image";

export function migrateCharacters(db: Database.Database) {
  db.exec(`
    CREATE TABLE school_art (hash TEXT PRIMARY KEY, bytes BLOB NOT NULL);
    CREATE TABLE school_character (
      ap_id TEXT PRIMARY KEY REFERENCES school_ap(id), name TEXT NOT NULL, description TEXT NOT NULL,
      image_hash TEXT REFERENCES school_art(hash), revision INTEGER NOT NULL
    );
    CREATE INDEX school_character_art ON school_character(image_hash);
    PRAGMA user_version=2;
  `);
}
function object(input: unknown, fields: string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !fields.includes(key))
  )
    invalid("form", "입력 형식을 확인해주세요.");
  return input as Record<string, unknown>;
}
function content(value: unknown, max: number, required: boolean) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    Array.from(value).some(
      (c) => (c.charCodeAt(0) < 32 && (required || c !== "\n")) || c.charCodeAt(0) === 127,
    ) ||
    Buffer.from(value).toString() !== value
  )
    invalid("form", "이름과 소개의 길이·문자를 확인해주세요.");
  return value.trim();
}
export function isApId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length === 36 &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)
  );
}
const selectCharacters = `SELECT a.id,a.name AS apName,n.ssid,(a.enabled=1 AND n.enabled=1) AS enabled,
  COALESCE(c.name,'이름 없는 친구') AS name,COALESCE(c.description,'') AS description,
  CASE WHEN c.image_hash IS NULL THEN NULL ELSE '/api/art/'||c.image_hash END AS imagePath,
  COALESCE(c.revision,0) AS revision FROM school_ap a JOIN school_network n ON n.id=a.network_id
  LEFT JOIN school_character c ON c.ap_id=a.id`;

export class CharacterStore {
  constructor(private readonly db: Database.Database) {}
  snapshot(): CharacterSnapshot {
    return this.db.transaction(() => {
      const meta = this.db.prepare("SELECT version FROM school_meta WHERE id=1").get() as {
        version: number;
      };
      const rows = this.db
        .prepare(`${selectCharacters} ORDER BY a.name,a.id LIMIT 5001`)
        .all() as (Omit<CharacterSnapshot["characters"][number], "enabled"> & {
        enabled: number;
      })[];
      if (rows.length > 5000) return unavailable();
      return {
        version: meta.version,
        characters: rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })),
      };
    })();
  }
  catalog(): Encyclopedia {
    const snapshot = this.snapshot();
    return {
      schemaVersion: 1,
      version: snapshot.version,
      characters: snapshot.characters
        .filter((c) => c.enabled)
        .map(({ id, name, description, imagePath }) => ({ id, name, description, imagePath })),
    };
  }
  async save(apId: string, input: unknown): Promise<CharacterSnapshot> {
    if (!isApId(apId)) invalid("apId", "등록된 AP를 선택해주세요.");
    const value = object(input, ["name", "description", "revision", "image"]);
    const name = content(value.name, 40, true);
    const description = content(value.description, 300, false);
    if (
      typeof value.revision !== "number" ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    )
      invalid("revision", "수정 버전이 필요합니다.");
    const image =
      value.image === undefined
        ? undefined
        : value.image === null
          ? null
          : await prepareCharacterArt(value.image);
    return this.db
      .transaction(() => {
        if (!this.db.prepare("SELECT id FROM school_ap WHERE id=?").get(apId))
          throw new SchoolError("not_found", "등록된 AP를 찾을 수 없습니다.");
        const old = this.db
          .prepare("SELECT revision,image_hash FROM school_character WHERE ap_id=?")
          .get(apId) as { revision: number; image_hash: string | null } | undefined;
        if ((old?.revision || 0) !== value.revision)
          throw new SchoolError(
            "conflict",
            "다른 곳에서 수정됐습니다. 최신 목록을 불러온 뒤 다시 편집해주세요.",
          );
        if (image)
          this.db
            .prepare("INSERT OR IGNORE INTO school_art VALUES (?,?)")
            .run(image.hash, image.bytes);
        const hash = image === undefined ? old?.image_hash || null : image?.hash || null;
        this.db
          .prepare(
            `INSERT INTO school_character VALUES (?,?,?,?,?) ON CONFLICT(ap_id) DO UPDATE SET name=excluded.name,description=excluded.description,image_hash=excluded.image_hash,revision=excluded.revision`,
          )
          .run(apId, name, description, hash, (old?.revision || 0) + 1);
        this.db
          .prepare(
            "DELETE FROM school_art WHERE NOT EXISTS (SELECT 1 FROM school_character WHERE image_hash=school_art.hash)",
          )
          .run();
        const size = this.db
          .prepare("SELECT COALESCE(SUM(length(bytes)),0) AS size FROM school_art")
          .get() as { size: number };
        if (size.size > 128 * 1024 * 1024)
          throw new SchoolError(
            "unavailable",
            "캐릭터 이미지 저장 한도에 도달했습니다. 사용하지 않는 이미지를 제거해주세요.",
          );
        this.db.prepare("UPDATE school_meta SET version=version+1 WHERE id=1").run();
        return this.snapshot();
      })
      .immediate();
  }
  asset(hash: string): Buffer | null {
    if (hash.length !== 64 || !/^[a-f0-9]+$/.test(hash)) return null;
    const row = this.db.prepare("SELECT bytes FROM school_art WHERE hash=?").get(hash) as
      | { bytes: Buffer }
      | undefined;
    return row?.bytes || null;
  }
  validateReports(input: unknown): string[] {
    const value = object(input, ["reports"]);
    if (!Array.isArray(value.reports) || value.reports.length > 100)
      invalid("reports", "연결 보고는 한 번에 100개 이하로 보내주세요.");
    const found = new Set<string>();
    const query =
      this.db.prepare(`SELECT a.id FROM school_ap a JOIN school_network n ON n.id=a.network_id
      WHERE a.id=? AND n.ssid=? AND a.bssid=? AND a.enabled=1 AND n.enabled=1`);
    for (const inputReport of value.reports) {
      const r = object(inputReport, ["apId", "ssid", "bssid"]);
      if (
        !isApId(r.apId) ||
        typeof r.ssid !== "string" ||
        typeof r.bssid !== "string" ||
        !query.get(r.apId, r.ssid, r.bssid)
      )
        invalid("reports", "현재 학교 설정과 일치하는 연결만 수집할 수 있습니다.");
      found.add(r.apId);
    }
    return [...found].sort();
  }
}
