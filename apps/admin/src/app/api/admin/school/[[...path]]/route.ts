import { readAuthConfig } from "@/server/auth/config";
import { getAdminAccess } from "@/server/auth/runtime";
import { createSchoolHandler } from "@/server/school/http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
const handler = createSchoolHandler({
  getAccess: getAdminAccess,
  getStore: getSchoolStore,
  origin: () => {
    const config = readAuthConfig(process.env);
    if (!config.ready) throw new Error("auth_unconfigured");
    return config.settings.baseURL;
  },
});
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
