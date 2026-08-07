/** Default Supabase project that hosts the "Sign in with DevDogs" OAuth server. */
export const DEFAULT_API_URL = "https://api.devdogsuga.org";

/** DevDogs website, used for human-facing links (registering an OAuth client). */
export const WEBSITE_URL = "https://devdogsuga.org";

/**
 * Custom OAuth/OIDC provider identifier. Supabase requires custom provider
 * identifiers to be prefixed with "custom:".
 */
export const PROVIDER_IDENTIFIER = "custom:devdogs";

export const PROVIDER_NAME = "DevDogs";

export const PROVIDER_SCOPES = ["openid", "email", "profile"];

export const ENV_KEYS = {
  baseUrl: "OAUTH_BASE_URL",
  providerName: "OAUTH_PROVIDER_NAME",
  clientId: "OAUTH_CLIENT_ID",
  clientSecret: "OAUTH_CLIENT_SECRET",
} as const;
