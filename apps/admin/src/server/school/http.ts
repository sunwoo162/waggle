import type { AdminAccess } from "../auth/access";
import { SchoolError } from "./errors";
import type { SchoolStore } from "./store";

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", ...extra },
  });
}
async function readJson(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
    return { error: 415 } as const;
  const reader = request.body?.getReader();
  if (!reader) return { error: 400 } as const;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) {
        await reader.cancel();
        return { error: 413 } as const;
      }
      chunks.push(value);
    }
    return {
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))),
    };
  } catch {
    return { error: 400 } as const;
  } finally {
    reader.releaseLock();
  }
}
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
      if (parts[0] === "networks") store.saveNetwork(body.value, parts[1]);
      else store.saveAccessPoint(body.value, parts[1]);
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
