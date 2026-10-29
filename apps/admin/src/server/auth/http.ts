import type { AdminAccess } from "./access";

function json(data: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store", ...headers },
  });
}

export function createAuthHttpHandler(
  resolveAuth: () => Promise<{ handler(request: Request): Promise<Response> } | null>,
) {
  const routes = new Map([
    ["/api/auth/sign-in/social", "POST"],
    ["/api/auth/callback/datagsm", "GET"],
    ["/api/auth/sign-out", "POST"],
  ]);
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = routes.get(url.pathname);
    if (!method) return json({ error: "not_found" }, 404);
    if (request.method !== method)
      return json({ error: "method_not_allowed" }, 405, { allow: method });
    try {
      const auth = await resolveAuth();
      if (!auth) return json({ error: "auth_unavailable" }, 503);
      let safeRequest = request;
      if (url.pathname === "/api/auth/callback/datagsm" && url.searchParams.has("error")) {
        url.searchParams.set(
          "error",
          url.searchParams.get("error") === "access_denied" ? "access_denied" : "provider_error",
        );
        url.searchParams.delete("error_description");
        safeRequest = new Request(url, {
          method: "GET",
          headers: request.headers,
          signal: request.signal,
        });
      }
      const response = await auth.handler(safeRequest);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return json({ error: "auth_unavailable" }, 503);
    }
  };
}

export function createAdminSessionHandler(getAccess: (headers: Headers) => Promise<AdminAccess>) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = await getAccess(request.headers);
      switch (access.kind) {
        case "authorized":
          return json({ role: "admin", user: access.user }, 200);
        case "unauthenticated":
          return json({ error: "unauthenticated" }, 401);
        case "forbidden":
          return json({ error: "forbidden" }, 403);
        default:
          return json({ error: "auth_unavailable" }, 503);
      }
    } catch {
      return json({ error: "auth_unavailable" }, 503);
    }
  };
}
