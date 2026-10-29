import path from "node:path";
import { unavailable } from "./errors";

export function readSchoolConfig(env: Record<string, string | undefined>, root: string) {
  const raw = env.WAGGLE_SETTINGS_ENCRYPTION_KEY;
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw) || raw === env.BETTER_AUTH_SECRET)
    return unavailable();
  const filename = path.resolve(
    /* turbopackIgnore: true */ root,
    env.WAGGLE_SETTINGS_DATABASE_PATH || ".data/school.sqlite",
  );
  const authFile = path.resolve(
    /* turbopackIgnore: true */ root,
    env.WAGGLE_AUTH_DATABASE_PATH || ".data/auth.sqlite",
  );
  if (filename.toLowerCase() === authFile.toLowerCase()) return unavailable();
  for (const directory of ["public", ".next"]) {
    const relative = path.relative(path.join(root, directory), filename);
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    )
      return unavailable();
  }
  return { key: Buffer.from(raw, "hex"), filename };
}
