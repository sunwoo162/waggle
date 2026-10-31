import type { AdminAccess } from "../auth/access";
import { requireRecentSignIn } from "../auth/recent";
import { jsonPrivate as json, readJson } from "../http";
import { MemberError, memberInvalid } from "./errors";
import type { MemberService } from "./service";

function fail(error: unknown) {
  if (error instanceof MemberError)
    return json(
      { code: error.code, message: error.publicMessage },
      { invalid: 400, unauthorized: 401, conflict: 409, rate_limited: 429, unavailable: 503 }[
        error.code
      ],
      error.code === "rate_limited" ? { "retry-after": "300" } : {},
    );
  return json({ message: "사용자 인증 저장소를 사용할 수 없습니다." }, 503);
}
function object(input: unknown, keys: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return memberInvalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !keys.includes(key))) return memberInvalid();
  return value;
}
function pathOf(request: Request, prefix: string) {
  const pathname = new URL(request.url).pathname.replace(/\/$/, "");
  return pathname === prefix
    ? ""
    : pathname.startsWith(`${prefix}/`)
      ? pathname.slice(prefix.length)
      : null;
}
function badMethod(allow: string) {
  return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow });
}
export function createMemberAdminHandler(deps: {
  getAccess: (headers: Headers) => Promise<AdminAccess>;
  getService: () => MemberService;
  origin: () => string;
  /** Operator action log (no codes or tokens). Optional so the member store works without the school store. */
  audit?: (operator: string, action: string, target: string) => void;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = await deps.getAccess(request.headers);
      if (access.kind !== "authorized")
        return json(
          { message: "운영자 인증을 확인해주세요." },
          access.kind === "unauthenticated" ? 401 : access.kind === "forbidden" ? 403 : 503,
        );
      const path = pathOf(request, "/api/admin/members");
      if (
        path === null ||
        (!/^\/[a-f0-9-]{36}\/(reissue|revoke)$/.test(path) &&
          !/^\/[a-f0-9-]{36}\/sessions\/[a-f0-9-]{36}\/revoke$/.test(path) &&
          path !== "")
      )
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      if (path === "" && request.method === "GET") return json(deps.getService().snapshot());
      if (request.method !== "POST") return badMethod(path === "" ? "GET, POST" : "POST");
      if (request.headers.get("origin") !== deps.origin())
        return json({ message: "같은 관리 사이트에서 요청해주세요." }, 403);
      const stale = requireRecentSignIn(access);
      if (stale) return stale;
      const parsed = await readJson(request);
      if ("error" in parsed)
        return json({ message: "JSON 입력 형식과 크기를 확인해주세요." }, parsed.error);
      const service = deps.getService();
      // Best effort: codes are already issued/revoked; an unavailable log must not hide the one-time code.
      const audit = (action: string, target: string) => {
        try {
          deps.audit?.(access.user.id, action, target);
        } catch {
          // Intentionally ignored.
        }
      };
      if (path === "") {
        const body = object(parsed.value, ["alias"]);
        const issued = await service.issue(body.alias);
        audit("member.issue", issued.member.id);
        return json({ ...issued, snapshot: service.snapshot() }, 201);
      }
      const body = object(parsed.value, ["revision"]);
      const parts = path.split("/").filter(Boolean);
      if (parts[1] === "reissue") {
        const issued = await service.reissue(parts[0], body.revision);
        audit("member.reissue", parts[0]);
        return json({ ...issued, snapshot: service.snapshot() });
      }
      if (parts[1] === "sessions") {
        await service.revokeDevice(parts[0], parts[2], body.revision);
        audit("member.device-revoke", parts[2]);
      } else {
        await service.revoke(parts[0], body.revision);
        audit("member.revoke", parts[0]);
      }
      return json({ snapshot: service.snapshot() });
    } catch (error) {
      return fail(error);
    }
  };
}
export function createClientHandler(deps: {
  getService: () => MemberService;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const path = pathOf(request, "/api/client");
      if (!path || !["/code-login", "/refresh", "/logout", "/me"].includes(path))
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      const allowed = path === "/me" ? "GET" : "POST";
      if (request.method !== allowed) return badMethod(allowed);
      const origin = request.headers.get("origin");
      if (origin && origin !== deps.origin())
        return json({ message: "허용되지 않은 요청 출처입니다." }, 403);
      if (path === "/me") {
        const token = request.headers
          .get("authorization")
          ?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1];
        const access = await deps.getService().access(token);
        return json({ member: access.member, device: access.device });
      }
      const parsed = await readJson(request);
      if ("error" in parsed)
        return json({ message: "JSON 입력 형식과 크기를 확인해주세요." }, parsed.error);
      const service = deps.getService();
      if (path === "/code-login") {
        const body = object(parsed.value, ["code", "platform", "deviceName"]);
        return json(
          await service.login({
            code: body.code,
            platform: body.platform,
            deviceName: body.deviceName,
          }),
        );
      }
      const body = object(parsed.value, ["refreshToken"]);
      if (path === "/refresh") return json(await service.refresh(body.refreshToken));
      await service.logout(body.refreshToken);
      return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      return fail(error);
    }
  };
}
