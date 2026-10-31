import { readMemberConfig } from "@/server/members/config";
import { getMemberService } from "@/server/members/runtime";
import { createWifiRequestClientHandler } from "@/server/school/request-http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
export const POST = createWifiRequestClientHandler({
  getMembers: getMemberService,
  getSchool: getSchoolStore,
  origin: () => readMemberConfig(process.env, process.cwd()).baseURL,
});
