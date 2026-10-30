import { jsonPrivate as json } from "../http";
import { MemberError } from "./errors";

export function clientRequest(
  request: Request,
  path: string,
  methods: string[],
  origin: string,
): Response | { token: string | undefined } {
  const url = new URL(request.url);
  if (url.pathname !== path) return json({ message: "경로를 찾을 수 없습니다." }, 404);
  if (!methods.includes(request.method))
    return json({ message: "허용되지 않은 요청 방식입니다." }, 405, { allow: methods.join(", ") });
  if (url.search) return json({ message: "요청 형식을 확인해주세요." }, 400);
  const source = request.headers.get("origin");
  if (source && source !== origin) return json({ message: "허용되지 않은 요청 출처입니다." }, 403);
  return { token: request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1] };
}
export function memberResponse(error: unknown): Response {
  if (error instanceof MemberError) {
    const status = {
      unauthorized: 401,
      invalid: 400,
      conflict: 409,
      rate_limited: 429,
      unavailable: 503,
    }[error.code];
    return json(
      { message: error.publicMessage },
      status,
      error.code === "rate_limited" ? { "retry-after": "300" } : {},
    );
  }
  return json({ message: "도감을 불러오지 못했습니다. 서버 상태를 확인해주세요." }, 503);
}
