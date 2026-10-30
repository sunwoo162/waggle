import { readMemberConfig } from "@/server/members/config";
import { createClientHandler } from "@/server/members/http";
import { getMemberService } from "@/server/members/runtime";
export const runtime = "nodejs";
const handler = createClientHandler({
  getService: getMemberService,
  origin: () => readMemberConfig(process.env, process.cwd()).baseURL,
});
export const GET = handler;
export const POST = handler;
