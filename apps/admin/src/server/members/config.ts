import { hkdfSync } from "node:crypto";
import path from "node:path";
import { memberUnavailable } from "./errors";
export function readMemberConfig(env: Record<string, string | undefined>, root: string) {
  const master = env.BETTER_AUTH_SECRET?.trim();
  if (!master || master.length < 32) return memberUnavailable();
  let baseURL: string;
  try {
    const url = new URL(env.BETTER_AUTH_URL?.trim() || "");
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )) ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return memberUnavailable();
    baseURL = url.origin;
  } catch {
    return memberUnavailable();
  }
  const filename = path.resolve(
    /* turbopackIgnore: true */ root,
    env.WAGGLE_MEMBERS_DATABASE_PATH || ".data/members.sqlite",
  );
  for (const other of [
    env.WAGGLE_AUTH_DATABASE_PATH || ".data/auth.sqlite",
    env.WAGGLE_SETTINGS_DATABASE_PATH || ".data/school.sqlite",
  ])
    if (
      filename.toLowerCase() === path.resolve(/* turbopackIgnore: true */ root, other).toLowerCase()
    )
      return memberUnavailable();
  for (const directory of ["public", ".next"]) {
    const relative = path.relative(
      path.join(/* turbopackIgnore: true */ root, directory),
      filename,
    );
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    )
      return memberUnavailable();
  }
  const secret = Buffer.from(hkdfSync("sha256", master, "waggle-v1", "member-auth", 32)).toString(
    "base64url",
  );
  return { baseURL, secret, filename };
}
