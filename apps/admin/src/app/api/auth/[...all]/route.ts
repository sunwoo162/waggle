import { createAuthHttpHandler } from "@/server/auth/http";
import { getAuthRuntime } from "@/server/auth/runtime";

export const runtime = "nodejs";
const handler = createAuthHttpHandler(async () => (await getAuthRuntime())?.auth ?? null);
export const GET = handler;
export const POST = handler;
