import { createAdminSessionHandler } from "@/server/auth/http";
import { getAdminAccess } from "@/server/auth/runtime";

export const runtime = "nodejs";
export const GET = createAdminSessionHandler(getAdminAccess);
