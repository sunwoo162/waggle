import { jsonPrivate as json } from "../http";
import { MemberError } from "../members/errors";
import type { MemberService } from "../members/service";
import type { SchoolStore } from "./store";

export function createConfigHandler(deps: {
  getMembers: () => MemberService;
  getSchool: () => SchoolStore;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/api/client/config")
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      if (request.method !== "GET")
        return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: "GET" });
      if (url.search) return json({ message: "요청 형식을 확인해주세요." }, 400);
      const origin = request.headers.get("origin");
      if (origin && origin !== deps.origin())
        return json({ message: "허용되지 않은 요청 출처입니다." }, 403);
      const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1];
      await deps.getMembers().configAccess(token);
      const config = deps.getSchool().clientConfig();
      const body = JSON.stringify(config);
      if (Buffer.byteLength(body, "utf8") > 1024 * 1024)
        return json({ message: "학교 설정을 전달할 수 없습니다." }, 503);
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof MemberError && error.code === "unauthorized")
        return json({ message: error.publicMessage }, 401);
      if (error instanceof MemberError && error.code === "rate_limited")
        return json({ message: error.publicMessage }, 429, { "retry-after": "300" });
      return json({ message: "학교 설정을 전달할 수 없습니다. 서버 상태를 확인해주세요." }, 503);
    }
  };
}
