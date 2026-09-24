import { describe, expect, it } from "vitest";
import { sql } from "./personas";

/**
 * These used to sign up for real through `anon().auth.signUp(...)`, which
 * exercised `before_user_created` the way GoTrue actually calls it. Since
 * `supabase/config.toml` set `[auth.email] enable_signup = false` (password
 * self-registration is disabled; OAuth is the only account-creation path
 * left), that endpoint now refuses every request before the hook ever runs —
 * "Signups not allowed for this instance", regardless of the email's domain.
 *
 * So this calls the hook function directly over the raw SQL connection
 * instead, the same shape GoTrue sends it (a `jsonb` event with a nested
 * `user.email`). `sql()` connects as the `postgres` superuser, which is not
 * subject to the `revoke execute ... from public, anon, authenticated` at
 * the bottom of the hook's migration — only `supabase_auth_admin` and
 * superusers may call it, same as GoTrue itself.
 */
describe("before-user-created email hook", () => {
  it("rejects an ordinary non-UGA account", async () => {
    const email = `outside-${crypto.randomUUID()}@example.com`;
    const [row] = await sql()`
      select "platform".require_uga_signup_email(
        jsonb_build_object('user', jsonb_build_object('email', ${email}::text))
      ) as result
    `;
    const result = row!.result as {
      error?: { http_code: number; message: string };
    };

    expect(result.error?.message).toContain(
      "Sign in with your uga.edu email address.",
    );
  });

  it("accepts uga.edu case-insensitively", async () => {
    const email = `HOOK-${crypto.randomUUID()}@UGA.EDU`;
    const [row] = await sql()`
      select "platform".require_uga_signup_email(
        jsonb_build_object('user', jsonb_build_object('email', ${email}::text))
      ) as result
    `;
    const result = row!.result as Record<string, unknown>;

    expect(result).toEqual({});
  });
});
