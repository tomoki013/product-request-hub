import "server-only";

/** Local development: skip Cloudflare Access and act as this user (API needs AUTH_DEV_BYPASS=true). */
export function isDevAuth(): boolean {
  return !!process.env.DEV_USER_EMAIL;
}
