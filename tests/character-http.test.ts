import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import type { AdminAccess } from "../apps/admin/src/server/auth/access";
import { createCollectionHandler } from "../apps/admin/src/server/members/collection-http";
import {
  createArtHandler,
  createCatalogHandler,
  createCharacterHandler,
} from "../apps/admin/src/server/school/character-http";
import { collectionFixture } from "./helpers/collection";

const origin = "http://localhost:3000";
function request(
  path: string,
  method = "GET",
  token?: string,
  value?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(value !== undefined ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
test("캐릭터 관리 API는 운영자·Origin·수정 버전 경계를 유지한다", async () => {
  const f = await collectionFixture({ publish: false });
  try {
    let access: AdminAccess = { kind: "unauthenticated" };
    let opens = 0;
    const handler = createCharacterHandler({
      getAccess: async () => access,
      getStore: () => {
        opens++;
        return f.school.characters;
      },
      origin: () => origin,
    });
    assert.equal((await handler(request("/api/admin/characters"))).status, 401);
    assert.equal(opens, 0);
    access = { kind: "forbidden" };
    assert.equal((await handler(request("/api/admin/characters"))).status, 403);
    assert.equal(opens, 0);
    access = { kind: "authorized", user: { id: "operator", name: "합성 운영자" } };
    const get = await handler(request("/api/admin/characters"));
    assert.equal(get.status, 200);
    assert.match(get.headers.get("cache-control") || "", /no-store/);
    const path = `/api/admin/characters/${f.ap.id}`;
    const value = { revision: 0, name: "쉿파이", description: "합성 소개" };
    assert.equal((await handler(request(path, "PATCH", undefined, value))).status, 403);
    assert.equal((await handler(request(path, "PATCH", undefined, value, { origin }))).status, 200);
    assert.equal((await handler(request(path, "PATCH", undefined, value, { origin }))).status, 409);
    assert.equal(
      (await handler(request("/api/admin/characters", "POST", undefined, value, { origin })))
        .status,
      405,
    );
    assert.equal((await handler(request("/api/admin/characters?school=other"))).status, 400);
    assert.equal((await handler(request(`${path}/unexpected`))).status, 404);
    const tooLarge = { ...value, revision: 1, description: "x".repeat(3 * 1024 * 1024) };
    assert.equal(
      (await handler(request(path, "PATCH", undefined, tooLarge, { origin }))).status,
      413,
    );
  } finally {
    f.close();
  }
});
test("앱 목록은 현재 Bearer 세션만 사용하고 장소·연결 정보·쿠키를 반환하지 않는다", async () => {
  const f = await collectionFixture();
  try {
    let opens = 0;
    const handler = createCatalogHandler({
      getMembers: () => f.members,
      getStore: () => {
        opens++;
        return f.school.characters;
      },
      origin: () => origin,
    });
    const invite = await f.members.issue("합성 도감");
    const tokens = await f.members.login({
      code: invite.code,
      platform: "windows",
      deviceName: "검증",
    });
    for (const bad of [
      request("/api/client/encyclopedia"),
      request("/api/client/encyclopedia", "GET", tokens.refreshToken),
      request("/api/client/encyclopedia", "GET", undefined, undefined, {
        cookie: `waggle-member.session_token=${tokens.refreshToken}`,
      }),
    ])
      assert.equal((await handler(bad)).status, 401);
    assert.equal(opens, 0);
    const result = await handler(request("/api/client/encyclopedia", "GET", tokens.accessToken));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("set-cookie"), null);
    const body = await result.text();
    for (const hidden of [
      f.ap.place,
      f.ap.building,
      f.ap.bssid,
      f.network.ssid,
      tokens.accessToken,
    ])
      assert.equal(body.includes(hidden), false);
    assert.equal(
      (
        await handler(
          request("/api/client/encyclopedia", "GET", tokens.accessToken, undefined, {
            origin: "https://foreign.example",
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (await handler(request("/api/client/encyclopedia?school=other", "GET", tokens.accessToken)))
        .status,
      400,
    );
    await f.members.revoke(invite.member.id, invite.member.revision);
    const before = opens;
    assert.equal(
      (await handler(request("/api/client/encyclopedia", "GET", tokens.accessToken))).status,
      401,
    );
    assert.equal(opens, before);
  } finally {
    f.close();
  }
});
test("수집 API는 활성 연결 보고만 계정별로 합치고 부분 저장·다른 계정 지정은 거부한다", async () => {
  const f = await collectionFixture();
  try {
    let opens = 0;
    const handler = createCollectionHandler({
      getMembers: () => f.members,
      getStore: () => {
        opens++;
        return f.school.characters;
      },
      origin: () => origin,
    });
    assert.equal(
      (await handler(request("/api/client/collection", "POST", undefined, {}))).status,
      401,
    );
    assert.equal(opens, 0);
    const invite = await f.members.issue("합성 수집");
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
    const report = { apId: f.ap.id, ssid: f.network.ssid, bssid: f.ap.bssid };
    const bad = await handler(
      request("/api/client/collection", "POST", phone.accessToken, {
        reports: [report, { ...report, apId: randomUUID() }],
      }),
    );
    assert.equal(bad.status, 400);
    assert.deepEqual(
      (await (await handler(request("/api/client/collection", "GET", pc.accessToken))).json())
        .apIds,
      [],
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await handler(
            request("/api/client/collection", "POST", phone.accessToken, {
              reports: [report, report],
            }),
          )
        ).status,
        200,
      );
    const result = await handler(request("/api/client/collection", "GET", pc.accessToken));
    assert.deepEqual((await result.json()).apIds, [f.ap.id]);
    assert.match(result.headers.get("cache-control") || "", /no-store/);
    assert.equal(
      (
        await handler(
          request("/api/client/collection", "POST", phone.accessToken, {
            reports: [report],
            memberId: randomUUID(),
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handler(
          request(
            "/api/client/collection",
            "POST",
            phone.accessToken,
            { reports: [report] },
            { origin: "https://foreign.example" },
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await handler(
          request("/api/client/collection", "POST", phone.accessToken, {
            padding: "x".repeat(17 * 1024),
          }),
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await handler(
          request(
            "/api/client/collection",
            "POST",
            phone.accessToken,
            {},
            { "content-type": "text/plain" },
          ),
        )
      ).status,
      415,
    );
    assert.equal(
      (await handler(request("/api/client/collection", "DELETE", phone.accessToken))).status,
      405,
    );
    assert.equal(
      (await handler(request("/api/client/collection?memberId=other", "GET", phone.accessToken)))
        .status,
      400,
    );
  } finally {
    f.close();
  }
});
test("공개 그림 경로는 재인코딩된 래스터만 고정 MIME·캐시로 반환한다", async () => {
  const f = await collectionFixture({ publish: false });
  try {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#0bb7ae" },
    })
      .png()
      .toBuffer();
    await f.school.characters.save(f.ap.id, {
      revision: 0,
      name: "쉿파이",
      description: "",
      image: { mime: "image/png", base64: png.toString("base64") },
    });
    const path = f.school.characters.catalog().characters[0].imagePath;
    assert.ok(path);
    const handler = createArtHandler({ getStore: () => f.school.characters });
    const result = await handler(request(path));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), "image/webp");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.match(result.headers.get("cache-control") || "", /immutable/);
    assert.equal((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).format, "webp");
    assert.equal((await handler(request("/api/art/not-a-hash"))).status, 404);
    assert.equal((await handler(request(`/api/art/${"0".repeat(64)}`))).status, 404);
    assert.equal((await handler(request(path, "POST"))).status, 405);
  } finally {
    f.close();
  }
});
