import { readAuthConfig } from "@/server/auth/config";
import { getAdminAccess } from "@/server/auth/runtime";
import { createMemberAdminHandler } from "@/server/members/http";
import { getMemberService } from "@/server/members/runtime";
import { getSchoolStore } from "@/server/school/runtime";
export const runtime = "nodejs";
const handler = createMemberAdminHandler({
  getAccess: getAdminAccess,
  getService: getMemberService,
  audit: (operator, action, target) => getSchoolStore().audit(operator, action, target),
  origin: () => {
    const config = readAuthConfig(process.env);
    if (!config.ready) throw new Error("auth_unconfigured");
    return config.settings.baseURL;
  },
});
export const GET = handler;
export const POST = handler;
