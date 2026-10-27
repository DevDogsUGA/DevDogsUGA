import { safeReturnPath } from "./returnPath";

/**
 * The three ways a sign-in can end without a session, as the visitor needs to
 * tell them apart. Account-linking problems are not here: they stay in the
 * settings flow (`connectedAccount.ts`).
 */
export const SIGN_IN_FAILURES = [
  "wrong_account",
  "cancelled",
  "unexpected",
] as const;
export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

export function isSignInFailure(value: unknown): value is SignInFailure {
  return (SIGN_IN_FAILURES as readonly unknown[]).includes(value);
}

/** What the visitor reads for each failure. Fixed copy, never provider text. */
export const SIGN_IN_FAILURE_COPY: Record<
  SignInFailure,
  { title: string; body: string }
> = {
  wrong_account: {
    title: "Use your UGA account",
    body: "DevDogs sign-in needs an @uga.edu Google account, and the account you chose isn't one. You weren't signed in.",
  },
  cancelled: {
    title: "Sign-in was cancelled",
    body: "Nothing changed. You can try again whenever you like.",
  },
  unexpected: {
    title: "We couldn't finish signing you in",
    body: "Something went wrong on our side or the provider's. Try again. If it keeps happening, ask in #tech-support on Discord and quote the reference below.",
  },
};

/**
 * Whether the provider sent the visitor back because they declined. Anything
 * else the provider reports is an unexpected failure; its wording is never
 * shown.
 */
export function failureFromProviderError(
  error: string | null,
  errorCode: string | null,
): SignInFailure {
  const declined = ["access_denied", "user_cancelled", "user_cancelled_login"];
  if (
    (error && declined.includes(error)) ||
    (errorCode && declined.includes(errorCode))
  ) {
    return "cancelled";
  }
  return "unexpected";
}

/** `SI-` and eight characters from an alphabet with no look-alikes. */
export const INCIDENT_REF_PATTERN = /^SI-[0-9A-HJKMNP-TV-Z]{8}$/;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newIncidentRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `SI-${Array.from(bytes, (b) => ALPHABET[b % 32]).join("")}`;
}

/** The recovery page's URL. `ref` is kept only for an unexpected failure. */
export function signInFailureUrl(
  failure: SignInFailure,
  returnTo: string,
  ref?: string,
): string {
  const params = new URLSearchParams({ reason: failure });
  const safe = safeReturnPath(returnTo);
  if (safe !== "/") params.set("returnTo", safe);
  if (failure === "unexpected" && ref) params.set("ref", ref);
  return `/auth/failed?${params.toString()}`;
}

/** The retry link: back through `/auth` toward the same destination. */
export function retryUrl(returnTo: string): string {
  const safe = safeReturnPath(returnTo);
  return safe === "/"
    ? "/auth"
    : `/auth?callbackPath=${encodeURIComponent(safe)}`;
}

/** The recovery page's query, read defensively: anything odd degrades. */
export function parseFailureQuery(query: {
  reason?: string | string[];
  returnTo?: string | string[];
  ref?: string | string[];
}): { failure: SignInFailure; returnTo: string; ref: string | null } {
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;
  const reason = one(query.reason);
  const failure = isSignInFailure(reason) ? reason : "unexpected";
  const ref = one(query.ref);
  return {
    failure,
    returnTo: safeReturnPath(one(query.returnTo)),
    ref:
      failure === "unexpected" && ref && INCIDENT_REF_PATTERN.test(ref)
        ? ref
        : null,
  };
}
