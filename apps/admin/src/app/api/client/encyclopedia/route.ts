import { readMemberConfig } from "@/server/members/config";
import { getMemberService } from "@/server/members/runtime";
import { createCatalogHandler } from "@/server/school/character-http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
export const GET = createCatalogHandler({
  getMembers: getMemberService,
  getStore: () => getSchoolStore().characters,
  origin: () => readMemberConfig(process.env, process.cwd()).baseURL,
});
