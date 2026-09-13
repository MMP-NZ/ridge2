/** Shared between the /start and /callback routes — kept out of route.ts files since Next.js only expects HTTP-method exports there. */
export const META_OAUTH_STATE_COOKIE = "meta_oauth_state";

export function metaConnectRedirectUri(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/meta/connect/callback`;
}
