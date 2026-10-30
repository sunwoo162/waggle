import { createCollectionHandler } from "@/server/members/collection-http";
import { readMemberConfig } from "@/server/members/config";
import { getMemberService } from "@/server/members/runtime";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
const handler = createCollectionHandler({
  getMembers: getMemberService,
  getStore: () => getSchoolStore().characters,
  origin: () => readMemberConfig(process.env, process.cwd()).baseURL,
});
export const GET = handler;
export const POST = handler;
