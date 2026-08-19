export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** Single-user desktop build: allow the local-dev auto-login even in production. */
  isLocalDesktop: process.env.LOCAL_DESKTOP === "1",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

/**
 * True when the app runs without any login: a local dev server or the
 * single-user desktop build, neither of which has an OAuth server to sign in
 * against. In this mode the context auto-provisions a local user and the
 * owner/admin checks are skipped, so sync and judging work out of the box.
 * Reads process.env directly so tests can toggle it.
 */
export function isLocalNoAuthMode(): boolean {
  if (process.env.OAUTH_SERVER_URL) return false;
  return (
    process.env.NODE_ENV !== "production" || process.env.LOCAL_DESKTOP === "1"
  );
}
