/**
 * Thin wrapper around fetch() for client-side API calls.
 *
 * Returns the response as-is so callers handle errors via their
 * existing `!res.ok` branches. Does NOT reload or redirect on 401 —
 * a 401 from the proxy can be a transient infrastructure hiccup
 * (Cosmos timeout, Key Vault cold start) rather than a truly expired
 * session. Reloading would just hit the same flaky path again and
 * clear the cookie on the page-level redirect, destroying the session.
 *
 * If the session is genuinely gone, the next page navigation will
 * redirect to /login naturally via the proxy.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const requestInit: RequestInit = { ...init };
  const method = (requestInit.method ?? "GET").toUpperCase();

  if (!requestInit.credentials) {
    requestInit.credentials = "same-origin";
  }

  if (!requestInit.cache && (method === "GET" || method === "HEAD")) {
    requestInit.cache = "no-store";
  }

  return fetch(input, requestInit);
}
