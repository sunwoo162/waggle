import { normalizeSubject } from "./policy";

export type AuthSettings = {
  baseURL: string;
  secret: string;
  clientId: string;
  operatorSubject: string;
};
type AuthConfiguration =
  | { ready: true; settings: AuthSettings }
  | { ready: false; missing: string[]; errors: string[] };

export function readAuthConfig(env: Record<string, string | undefined>): AuthConfiguration {
  const fields = [
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "DATAGSM_CLIENT_ID",
    "WAGGLE_ADMIN_DATAGSM_ID",
  ];
  const missing = fields.filter((name) => !env[name]?.trim());
  const errors: string[] = [];
  let baseURL = "";
  if (env.BETTER_AUTH_URL?.trim()) {
    try {
      const url = new URL(env.BETTER_AUTH_URL.trim());
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.pathname !== "/" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("invalid origin");
      baseURL = url.origin;
    } catch {
      errors.push("BETTER_AUTH_URL은 HTTPS origin 또는 loopback 개발 origin이어야 합니다.");
    }
  }
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (secret && secret.length < 32)
    errors.push("BETTER_AUTH_SECRET은 32자 이상의 임의 값이어야 합니다.");
  const operatorSubject = normalizeSubject(env.WAGGLE_ADMIN_DATAGSM_ID?.trim());
  if (env.WAGGLE_ADMIN_DATAGSM_ID?.trim() && !operatorSubject)
    errors.push("WAGGLE_ADMIN_DATAGSM_ID에는 운영자 한 명의 고유 ID를 지정하세요.");
  if (missing.length || errors.length || !operatorSubject) return { ready: false, missing, errors };
  return {
    ready: true,
    settings: { baseURL, secret, clientId: env.DATAGSM_CLIENT_ID?.trim() ?? "", operatorSubject },
  };
}
