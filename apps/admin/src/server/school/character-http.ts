import type { AdminAccess } from "../auth/access";
import { jsonPrivate as json, readJson } from "../http";
import { clientRequest, memberResponse } from "../members/client-request";
import type { MemberService } from "../members/service";
import { type CharacterStore, isApId } from "./characters";
import { SchoolError } from "./errors";

export function characterResponse(error: unknown) {
  if (error instanceof SchoolError)
    return json(
      { message: error.publicMessage, field: error.field },
      { invalid: 400, conflict: 409, not_found: 404, unavailable: 503 }[error.code],
    );
  return memberResponse(error);
}
export function createCharacterHandler(deps: {
  getAccess: (headers: Headers) => Promise<AdminAccess>;
  getStore: () => CharacterStore;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = await deps.getAccess(request.headers);
      if (access.kind !== "authorized")
        return json(
          { message: "운영자 인증을 확인해주세요." },
          access.kind === "unauthenticated" ? 401 : access.kind === "forbidden" ? 403 : 503,
        );
      const url = new URL(request.url);
      const path = url.pathname;
      const apId = path.startsWith("/api/admin/characters/")
        ? path.slice("/api/admin/characters/".length)
        : undefined;
      if (path !== "/api/admin/characters" && !isApId(apId))
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      if (url.search) return json({ message: "요청 형식을 확인해주세요." }, 400);
      const method = apId ? "PATCH" : "GET";
      if (request.method !== method)
        return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: method });
      if (!apId) return json(deps.getStore().snapshot());
      if (request.headers.get("origin") !== deps.origin())
        return json({ message: "같은 관리 사이트에서 요청해주세요." }, 403);
      const body = await readJson(request, 3 * 1024 * 1024);
      if ("error" in body)
        return json({ message: "그림 용량과 JSON 입력 형식을 확인해주세요." }, body.error);
      return json(await deps.getStore().save(apId, body.value));
    } catch (error) {
      return characterResponse(error);
    }
  };
}
export function createCatalogHandler(deps: {
  getMembers: () => MemberService;
  getStore: () => CharacterStore;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = clientRequest(request, "/api/client/encyclopedia", ["GET"], deps.origin());
      if (access instanceof Response) return access;
      await deps.getMembers().collectionAccess(access.token);
      const body = JSON.stringify(deps.getStore().catalog());
      if (Buffer.byteLength(body) > 4 * 1024 * 1024)
        return json({ message: "도감 목록이 너무 큽니다. 운영자에게 문의해주세요." }, 503);
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      return characterResponse(error);
    }
  };
}
export function createArtHandler(deps: { getStore: () => CharacterStore }) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/api\/art\/([a-f0-9]{64})$/);
      if (!match) return json({ message: "그림을 찾을 수 없습니다." }, 404);
      if (request.method !== "GET")
        return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: "GET" });
      if (url.search) return json({ message: "요청 형식을 확인해주세요." }, 400);
      const bytes = deps.getStore().asset(match[1]);
      if (!bytes) return json({ message: "그림을 찾을 수 없습니다." }, 404);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "image/webp",
          "content-length": String(bytes.length),
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
        },
      });
    } catch {
      return json({ message: "그림을 불러오지 못했습니다." }, 503);
    }
  };
}
