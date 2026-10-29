import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import type { AuthSettings } from "./config";
import { selectOperatorProfile } from "./policy";

export const DATAGSM_ENDPOINTS = {
  authorize: "https://oauth.authorization.datagsm.kr/v1/oauth/authorize",
  token: "https://oauth.authorization.datagsm.kr/v1/oauth/token",
  userinfo: "https://oauth.resource.datagsm.kr/userinfo",
} as const;

export function createDataGsmProvider(
  settings: AuthSettings,
  fetcher: typeof fetch,
): GenericOAuthConfig<"datagsm"> {
  return {
    providerId: "datagsm",
    name: "DataGSM",
    clientId: settings.clientId,
    authorizationUrl: DATAGSM_ENDPOINTS.authorize,
    tokenUrl: DATAGSM_ENDPOINTS.token,
    scopes: ["datagsm:self_read"],
    pkce: true,
    disableProviderLogout: true,
    async getToken({ code, redirectURI, codeVerifier }) {
      if (!codeVerifier) throw new Error("provider_exchange_failed");
      try {
        const response = await fetcher(DATAGSM_ENDPOINTS.token, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: settings.clientId,
            redirect_uri: redirectURI,
            code_verifier: codeVerifier,
          }),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("provider_exchange_failed");
        const raw: unknown = await response.json();
        if (raw === null || typeof raw !== "object") throw new Error("provider_exchange_failed");
        const data = raw as Record<string, unknown>;
        if (
          typeof data.access_token !== "string" ||
          !data.access_token ||
          data.token_type !== "Bearer" ||
          typeof data.expires_in !== "number" ||
          !Number.isSafeInteger(data.expires_in) ||
          data.expires_in <= 0 ||
          data.expires_in > 86400
        )
          throw new Error("provider_exchange_failed");
        return {
          accessToken: data.access_token,
          refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
          accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
          scopes: ["datagsm:self_read"],
        };
      } catch {
        throw new Error("provider_exchange_failed");
      }
    },
    async getUserInfo(tokens) {
      try {
        if (!tokens.accessToken) return null;
        const response = await fetcher(DATAGSM_ENDPOINTS.userinfo, {
          headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" },
          signal: AbortSignal.timeout(5000),
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) return null;
        const profile = selectOperatorProfile(await response.json(), settings.operatorSubject);
        return profile
          ? {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              emailVerified: false,
              status: profile.status,
            }
          : null;
      } catch {
        return null;
      }
    },
    mapProfileToUser(profile) {
      return { name: profile.name, email: profile.email, emailVerified: false };
    },
  };
}
