import "server-only";
import { readAuthConfig } from "../auth/config";
import { getAdminAccess } from "../auth/runtime";
import { createCharacterHandler } from "./character-http";
import { getSchoolStore } from "./runtime";

export const characterHandler = createCharacterHandler({
  getAccess: getAdminAccess,
  getStore: () => getSchoolStore().characters,
  origin: () => {
    const config = readAuthConfig(process.env);
    if (!config.ready) throw new Error("auth_unconfigured");
    return config.settings.baseURL;
  },
});
