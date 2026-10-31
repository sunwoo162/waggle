import { jsonPrivate as json } from "../http";
import type { AdminAccess } from "./access";

/** Wi-Fi passwords, personal codes and request approval need a sign-in from the last 15 minutes. */
export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

export function requireRecentSignIn(
  access: Extract<AdminAccess, { kind: "authorized" }>,
  now = Date.now(),
): Response | null {
  if (access.signedInAt === undefined || now - access.signedInAt <= RECENT_SIGN_IN_MS) return null;
  return json(
    {
      code: "reauth",
      message:
        "보안을 위해 로그아웃한 뒤 다시 로그인하고 시도해주세요(최근 15분 안의 로그인이 필요해요).",
    },
    403,
  );
}
