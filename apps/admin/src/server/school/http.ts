import type { AdminAccess } from "../auth/access";
import { requireRecentSignIn } from "../auth/recent";
import { jsonPrivate as json, readJson } from "../http";
import { SchoolError } from "./errors";
import type { SchoolStore } from "./store";

export function createSchoolHandler(deps: {
  getAccess: (headers: Headers) => Promise<AdminAccess>;
  getStore: () => SchoolStore | Promise<SchoolStore>;
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
      const pathname = new URL(request.url).pathname.replace(/\/$/, "");
      const path = pathname.slice("/api/admin/school".length);
      if (
        !pathname.startsWith("/api/admin/school") ||
        (path && !/^\/(networks|access-points)(?:\/[a-f0-9-]{36})?$/.test(path))
      )
        return json({ message: "경로를 찾을 수 없습니다." }, 404);
      const parts = path.split("/").filter(Boolean);
      const allowed = !path ? "GET" : parts.length === 1 ? "POST" : "PATCH";
      if (request.method !== allowed)
        return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: allowed });
      if (request.method === "GET") return json((await deps.getStore()).snapshot());
      if (request.headers.get("origin") !== deps.origin())
        return json({ message: "같은 관리 사이트에서 요청해주세요." }, 403);
      // Checked before reading the body: password-bearing writes need a recent sign-in.
      if (parts[0] === "networks") {
        const stale = requireRecentSignIn(access);
        if (stale) return stale;
      }
      const body = await readJson(request);
      if ("error" in body)
        return json(
          {
            message:
              body.error === 413 ? "입력 내용이 너무 큽니다." : "JSON 입력 형식을 확인해주세요.",
          },
          body.error,
        );
      const store = await deps.getStore();
      if (parts[0] === "networks") {
        const saved = store.saveNetwork(body.value, parts[1]);
        store.audit(access.user.id, "network.save", saved.id);
      } else {
        const saved = store.saveAccessPoint(body.value, parts[1]);
        store.audit(access.user.id, "ap.save", saved.id);
      }
      return json(store.snapshot(), allowed === "POST" ? 201 : 200);
    } catch (error) {
      if (error instanceof SchoolError)
        return json(
          { code: error.code, message: error.publicMessage, field: error.field },
          error.code === "invalid"
            ? 400
            : error.code === "conflict"
              ? 409
              : error.code === "not_found"
                ? 404
                : 503,
        );
      return json({ message: "설정 저장소를 사용할 수 없습니다. 운영 설정을 확인해주세요." }, 503);
    }
  };
}
