/**
 * The name each provider reports for a linked identity. Supabase's providers
 * disagree about where it lives, so each gets its own reader. Plain functions
 * with no "use client", so both the fields and the server-rendered pages that
 * mention the account (the profile's visibility switches) can call them.
 */

/** GitHub writes `user_name`. */
export function githubUserName(identityData: unknown): string | undefined {
  return identityData &&
    typeof identityData === "object" &&
    "user_name" in identityData &&
    typeof identityData.user_name === "string"
    ? identityData.user_name
    : undefined;
}

/**
 * Supabase's Discord provider writes no `user_name` (GitHub's does). The
 * Discord username lands in `full_name`; `name` is the legacy `username#0`.
 */
export function discordUserName(identityData: unknown): string | undefined {
  return identityData &&
    typeof identityData === "object" &&
    "full_name" in identityData &&
    typeof identityData.full_name === "string"
    ? identityData.full_name
    : undefined;
}

export function linkedinName(identityData: unknown): string | undefined {
  if (!identityData || typeof identityData !== "object") return undefined;
  if ("name" in identityData && typeof identityData.name === "string") {
    return identityData.name;
  }
  const given =
    "given_name" in identityData && typeof identityData.given_name === "string"
      ? identityData.given_name
      : "";
  const family =
    "family_name" in identityData &&
    typeof identityData.family_name === "string"
      ? identityData.family_name
      : "";
  const full = [given, family].filter(Boolean).join(" ");
  return full || undefined;
}
