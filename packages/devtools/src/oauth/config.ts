/** Default Supabase project that hosts the "Sign in with DevDogs" OAuth server. */
export const DEFAULT_API_URL = "https://api.devdogsuga.org";

/**
 * Every host the platform's auth server has answered on, in the order to try.
 * The platform's project moves from its custom domain to the vanity name
 * `devdogsuga.supabase.co` at a deploy gate (Q90), and `api.devdogsuga.org`
 * then becomes a Worker-routed host with no `/auth/v1`; discovery tries each,
 * so one build of devtools works on both sides of the move.
 */
export const DEFAULT_API_URLS: readonly string[] = [
  DEFAULT_API_URL,
  "https://devdogsuga.supabase.co",
];

/**
 * DevDogs website — human-facing links, and (since TASK-351) the origin
 * that serves the one-click connect flow's `/oauth/connect` and
 * `/oauth/connect/exchange` endpoints. Overridable via `--platform-url`
 * / `DEVDOGS_PLATFORM_URL` for local testing against a platform dev server —
 * see `commands.ts`'s `oauth` node and `wizard.ts`.
 */
export const WEBSITE_URL = "https://devdogsuga.org";

/**
 * Custom OAuth/OIDC provider identifier. Supabase requires custom provider
 * identifiers to be prefixed with "custom:".
 */
export const PROVIDER_IDENTIFIER = "custom:devdogsuga";

export const PROVIDER_NAME = "DevDogs";

export const PROVIDER_SCOPES = ["openid", "email", "profile"];

export const ENV_KEYS = {
  baseUrl: "OAUTH_BASE_URL",
  providerName: "OAUTH_PROVIDER_NAME",
  clientId: "OAUTH_CLIENT_ID",
  clientSecret: "OAUTH_CLIENT_SECRET",
  platformUrl: "DEVDOGS_PLATFORM_URL",
} as const;
