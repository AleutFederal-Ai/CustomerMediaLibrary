/**
 * Thin wrapper around fetch() for client-side API calls.
 * Handles 401 (session expired) globally so every component
 * doesn't need its own redirect-to-login logic.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    // Session expired — reload so the proxy redirects to /login
    window.location.reload();
    // Throw to prevent callers from processing the response
    throw new Error("Session expired");
  }
  return res;
}
