import { readAuthConfig } from "@/server/auth/config";
import { getAdminAccess } from "@/server/auth/runtime";
import { createWifiRequestAdminHandler } from "@/server/school/request-http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
const handler = createWifiRequestAdminHandler({
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
