/**
 * Thin wrapper over Meta's Graph API — plain fetch, no SDK. Every call
 * needs a real META_APP_ID/META_APP_SECRET (and, for page-scoped calls, a
 * connected Page's access token) to actually reach Meta; see
 * docs/decisions.md for why that doesn't exist yet.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v21.0";
}

function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(graphUrl(path, params));
  if (!response.ok) {
    throw new Error(`Meta Graph API GET ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(graphUrl(path, {}), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok) {
    throw new Error(`Meta Graph API POST ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function oauthDialogUrl(redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", requireEnv("META_APP_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    ["pages_show_list", "pages_manage_metadata", "pages_read_engagement", "leads_retrieval", "ads_management"].join(","),
  );
  return url.toString();
}

export async function exchangeCodeForUserToken(code: string, redirectUri: string): Promise<string> {
  const data = await graphGet<{ access_token: string }>("oauth/access_token", {
    client_id: requireEnv("META_APP_ID"),
    client_secret: requireEnv("META_APP_SECRET"),
    redirect_uri: redirectUri,
    code,
  });
  return data.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
}

/** Pages the connecting user manages, each with its own (short-lived) page access token. */
export async function listManagedPages(userAccessToken: string): Promise<MetaPage[]> {
  const data = await graphGet<{ data: MetaPage[] }>("me/accounts", { access_token: userAccessToken });
  return data.data;
}

/** Exchanges a short-lived Page token for a long-lived one (Meta's Page tokens from /me/accounts don't expire the same way user tokens do, but this is the documented long-lived exchange for the underlying user token first). */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const data = await graphGet<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: requireEnv("META_APP_ID"),
    client_secret: requireEnv("META_APP_SECRET"),
    fb_exchange_token: shortLivedToken,
  });
  return data.access_token;
}

/** Subscribes a Page to this app's `leadgen` webhook field. */
export async function subscribePageToLeadgenWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  await graphPost(`${pageId}/subscribed_apps`, {
    subscribed_fields: "leadgen",
    access_token: pageAccessToken,
  });
}

export interface MetaLeadField {
  name: string;
  values: string[];
}

export interface MetaLeadData {
  id: string;
  created_time: string;
  field_data: MetaLeadField[];
}

/** Fetches the actual submitted lead data — the webhook payload itself only carries the leadgen_id. */
export async function getLead(leadgenId: string, pageAccessToken: string): Promise<MetaLeadData> {
  return graphGet<MetaLeadData>(leadgenId, { access_token: pageAccessToken });
}
