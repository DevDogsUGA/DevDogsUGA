/**
 * The pure parts of the consent screen: what is shared, where the member is
 * sent back to, where the logo lives. Kept free of the database and the
 * request so the wording and the host rule are testable on their own.
 */

/**
 * What an app receives for each scope, in the words the card shows. The list
 * follows what Supabase Auth's userinfo endpoint returns (see the comment in
 * `consentTarget.ts`): `sub` always, `email` and `email_verified` for `email`,
 * name, picture, username and the account's profile metadata for `profile`,
 * `phone` for `phone`. A scope Supabase Auth does not filter on adds nothing.
 */
const SCOPE_FIELDS: Record<string, readonly string[]> = {
  openid: ["Your DevDogs member ID"],
  email: ["Your email address"],
  profile: [
    "Your name and profile picture",
    "Your username, if you have one",
    "Other profile details saved on your account",
  ],
  phone: ["Your phone number"],
};

/**
 * `/auth/v1/user` returns the whole account record to any token, whatever the
 * scopes: phone, linked sign-in accounts, sign-in times and metadata.
 */
const ACCOUNT_RECORD =
  "Your whole account record: email, name and profile details, linked sign-in accounts, phone number and sign-in times";

/** The scopes an authorization asked for, in order, without duplicates. */
export function parseScopes(scope: string): string[] {
  return [...new Set(scope.split(/[\s,]+/).filter(Boolean))];
}

/**
 * The fixed list of what the app gets, derived from the requested scopes. The
 * member ID is always shared (it is `sub`, returned whatever the scopes are).
 */
export function sharedFields(scope: string): string[] {
  const fields = new Set<string>(SCOPE_FIELDS.openid);
  for (const name of parseScopes(scope)) {
    for (const field of SCOPE_FIELDS[name] ?? []) fields.add(field);
  }
  // Whatever the scopes, the token can also read the account record from
  // Supabase Auth's `/user` endpoint, which is not scope-filtered.
  fields.add(ACCOUNT_RECORD);
  return [...fields];
}

/**
 * The host the member is returned to, from the stored redirect address (the
 * one the redirect rule validated). Null for anything unparseable.
 */
export function returnHost(redirectUri: string | null): string | null {
  if (!redirectUri) return null;
  try {
    return new URL(redirectUri).host || null;
  } catch {
    return null;
  }
}

/**
 * The public URL of an app's logo, which lives in our own storage (never a
 * link to the app's server). `logoPath` is relative to the public bucket; a
 * path that climbs out of it, or is empty, yields no logo.
 */
export function logoUrl(
  logoPath: string | null,
  storage: { baseUrl: string; bucket: string },
): string | null {
  if (!logoPath) return null;
  const segments = logoPath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return `${storage.baseUrl}/storage/v1/object/public/${encodeURIComponent(storage.bucket)}/${segments.map(encodeURIComponent).join("/")}`;
}

/** The letter the logo tile shows when an app has no logo. */
export function logoLetter(label: string): string {
  const first = [...label.trim()][0];
  return first ? first.toUpperCase() : "?";
}
