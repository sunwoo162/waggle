import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { assertMemberSchema, migrateMembers } from "../apps/admin/src/server/members/factory";
import { collectionFixture } from "./helpers/collection";

test("수집 스키마는 명시적으로 이전하며 기존 코드·세션·키를 보존한다", async () => {
  const f = await collectionFixture();
  try {
    const invite = await f.members.issue("합성 사용자");
    const tokens = await f.members.login({
      code: invite.code,
      platform: "windows",
      deviceName: "검증",
    });
    f.db.exec("DROP TABLE IF EXISTS native_collection; UPDATE native_meta SET schema_version=1;");
    assert.throws(() => assertMemberSchema(f.db, f.settings));
    await assert.rejects(() =>
      migrateMembers(f.auth, f.db, { ...f.settings, secret: "different-synthetic-only-key" }),
    );
    await migrateMembers(f.auth, f.db, f.settings);
    await migrateMembers(f.auth, f.db, f.settings);
    assert.equal(
      (f.db.prepare("SELECT schema_version FROM native_meta").get() as { schema_version: number })
        .schema_version,
      2,
    );
    assert.equal((await f.members.access(tokens.accessToken)).member.id, invite.member.id);
    assert.equal(f.members.snapshot().members[0].codeActive, true);
  } finally {
    f.close();
  }
});
test("같은 계정의 두 기기는 수집을 공유하고 다른 계정은 격리한다", async () => {
  const f = await collectionFixture();
  try {
    const invite = await f.members.issue("합성 사용자");
    const phone = await f.members.login({
      code: invite.code,
      platform: "android",
      deviceName: "휴대폰",
    });
    const pc = await f.members.login({
      code: invite.code,
      platform: "windows",
      deviceName: "노트북",
    });
    const other = await f.members.issue("다른 합성 사용자");
    const otherTokens = await f.members.login({
      code: other.code,
      platform: "windows",
      deviceName: "검증",
    });
    const report = { reports: [{ apId: f.ap.id, ssid: f.network.ssid, bssid: f.ap.bssid }] };
    const a = await f.members.collectionAccess(phone.accessToken);
    const ids = f.school.characters.validateReports(report);
    assert.deepEqual(f.members.mergeCollection(a, ids).apIds, [f.ap.id]);
    f.members.mergeCollection(a, ids);
    assert.deepEqual(
      f.members.mergeCollection(await f.members.collectionAccess(pc.accessToken)).apIds,
      [f.ap.id],
    );
    assert.deepEqual(
      f.members.mergeCollection(await f.members.collectionAccess(otherTokens.accessToken)).apIds,
      [],
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) count FROM native_collection").get() as { count: number })
        .count,
      1,
    );
    const columns = f.db.pragma("table_info(native_collection)") as { name: string }[];
    assert.deepEqual(
      columns.map((column) => column.name),
      ["member_id", "ap_id"],
    );
    // Access was checked earlier, but a revoked session must still fail at the write boundary.
    await f.members.revoke(invite.member.id, invite.member.revision);
    assert.throws(() => f.members.mergeCollection(a, [f.ap.id]), /unauthorized/);
    await assert.rejects(() => f.members.collectionAccess(phone.accessToken), /unauthorized/);
  } finally {
    f.close();
  }
});
test("집합은 대량 입력을 제한하고 기기별 도감 요청 제한은 다른 기기를 막지 않는다", async () => {
  const f = await collectionFixture();
  try {
    const invite = await f.members.issue("합성 제한");
    const pc = await f.members.login({
      code: invite.code,
      platform: "windows",
      deviceName: "노트북",
    });
    const phone = await f.members.login({
      code: invite.code,
      platform: "android",
      deviceName: "휴대폰",
    });
    const identity = await f.members.collectionAccess(pc.accessToken);
    assert.throws(
      () =>
        f.members.mergeCollection(
          identity,
          Array.from({ length: 101 }, () => randomUUID()),
        ),
      /invalid/,
    );
    for (let i = 1; i < 60; i++) await f.members.collectionAccess(pc.accessToken);
    await assert.rejects(() => f.members.collectionAccess(pc.accessToken), /rate_limited/);
    await f.members.collectionAccess(phone.accessToken);
    f.advance();
    await f.members.collectionAccess(pc.accessToken);
  } finally {
    f.close();
  }
});
test("수집 집합 상한을 넘는 병합은 전체를 되돌리고 기존 기록을 보존한다", async () => {
  const f = await collectionFixture();
  try {
    const invite = await f.members.issue("합성 집합 상한");
    const tokens = await f.members.login({
      code: invite.code,
      platform: "windows",
      deviceName: "검증",
    });
    const identity = await f.members.collectionAccess(tokens.accessToken);
    const insert = f.db.prepare("INSERT INTO native_collection VALUES (?,?)");
    f.db.transaction(() => {
      for (let i = 0; i < 10000; i++) insert.run(invite.member.id, randomUUID());
    })();
    assert.throws(() => f.members.mergeCollection(identity, [f.ap.id]), /conflict/);
    const saved = f.members.mergeCollection(identity);
    assert.equal(saved.apIds.length, 10000);
    assert.equal(saved.apIds.includes(f.ap.id), false);
  } finally {
    f.close();
  }
});
