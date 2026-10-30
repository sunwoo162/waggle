import { readMemberConfig } from "@/server/members/config";
import { getMemberService } from "@/server/members/runtime";
import { createConfigHandler } from "@/server/school/client-http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
export const GET = createConfigHandler({
  getMembers: getMemberService,
  getSchool: getSchoolStore,
  origin: () => readMemberConfig(process.env, process.cwd()).baseURL,
});
