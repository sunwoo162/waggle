import { DATAGSM_ENDPOINTS } from "./datagsm";
import { normalizeSubject } from "./policy";

/**
 * One-off local helper for the operator: sign in to DataGSM once and learn your own top-level
 * account id (the value WAGGLE_ADMIN_DATAGSM_ID needs). Nothing is stored; tokens are dropped.
 */
export function whoamiAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(DATAGSM_ENDPOINTS.authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: "datagsm:self_read",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Exchanges the code and returns only the account id, or null on any failure. */
export async function readOwnAccountId(
  fetcher: typeof fetch,
  input: { code: string; clientId: string; redirectUri: string; verifier: string },
): Promise<string | null> {
  try {
    const token = await fetcher(DATAGSM_ENDPOINTS.token, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: input.code,
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    if (!token.ok) return null;
    const data = (await token.json()) as Record<string, unknown> | null;
    if (!data || typeof data.access_token !== "string" || !data.access_token) return null;
    const info = await fetcher(DATAGSM_ENDPOINTS.userinfo, {
      headers: { authorization: `Bearer ${data.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    if (!info.ok) return null;
    const profile = (await info.json()) as Record<string, unknown> | null;
    return normalizeSubject(profile?.id);
  } catch {
    return null;
  }
}
