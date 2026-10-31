import type { AdminAccess } from "../auth/access";
import { requireRecentSignIn } from "../auth/recent";
import { jsonPrivate as json, readJson } from "../http";
import { clientRequest } from "../members/client-request";
import type { MemberService } from "../members/service";
import { characterResponse } from "./character-http";
import type { SchoolStore } from "./store";

/** POST /api/client/wifi-requests: a signed-in student asks the operator to register an in-school Wi-Fi. */
export function createWifiRequestClientHandler(deps: {
  getMembers: () => MemberService;
  getSchool: () => SchoolStore;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = clientRequest(request, "/api/client/wifi-requests", ["POST"], deps.origin());
      if (access instanceof Response) return access;
      await deps.getMembers().wifiRequestAccess(access.token);
      const body = await readJson(request);
      if ("error" in body)
        return json({ message: "요청의 JSON 형식과 용량을 확인해주세요." }, body.error);
      return json(deps.getSchool().submitWifiRequest(body.value), 202);
    } catch (error) {
      return characterResponse(error);
    }
  };
}

/** Operator inbox: GET list, POST /<id>/approve, POST /<id>/reject. */
export function createWifiRequestAdminHandler(deps: {
  getAccess: (headers: Headers) => Promise<AdminAccess>;
  getStore: () => SchoolStore;
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
      const path = url.pathname.replace(/\/$/, "").slice("/api/admin/wifi-requests".length);
      if (!url.pathname.startsWith("/api/admin/wifi-requests") || url.search)
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      if (!path) {
        if (request.method !== "GET")
          return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: "GET" });
        return json({ requests: deps.getStore().wifiRequests() });
      }
      const match = path.match(/^\/([a-f0-9-]{36})\/(approve|reject)$/);
      if (!match) return json({ message: "경로를 찾을 수 없습니다." }, 404);
      if (request.method !== "POST")
        return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: "POST" });
      if (request.headers.get("origin") !== deps.origin())
        return json({ message: "같은 관리 사이트에서 요청해주세요." }, 403);
      const stale = requireRecentSignIn(access);
      if (stale) return stale;
      const store = deps.getStore();
      if (match[2] === "approve") store.approveWifiRequest(match[1]);
      else store.rejectWifiRequest(match[1]);
      store.audit(access.user.id, `wifi-request.${match[2]}`, match[1]);
      return json({ requests: store.wifiRequests() });
    } catch (error) {
      return characterResponse(error);
    }
  };
}
