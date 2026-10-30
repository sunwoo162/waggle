import { createArtHandler } from "@/server/school/character-http";
import { getSchoolStore } from "@/server/school/runtime";

export const runtime = "nodejs";
export const GET = createArtHandler({ getStore: () => getSchoolStore().characters });
