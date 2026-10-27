"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect, unstable_rethrow } from "next/navigation";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { env } from "~/env";
import { authenticate, expectUserWith } from "~/server/auth";
import { approveAuthorization } from "~/server/oauth/approveAuthorization";
import { supabaseAdmin } from "~/supabase/admin";
import { createSupabaseServerClient } from "~/supabase/server";

const approveAsTestAccountSchema = zfd.formData({
  authorizationId: zfd.text(),
  testUserId: zfd.text(z.uuid()),
});

const denySchema = zfd.formData({
  authorizationId: zfd.text(),
});

export async function approveTestAccountAuthorization(
  _prevState: null | string,
  formData: FormData,
) {
  try {
    const { authorizationId, testUserId } =
      await approveAsTestAccountSchema.parseAsync(formData);

    // Verify the signed-in user owns the client this test account belongs to,
    // and that it is a development client.
    const user = await expectUserWith({
      testAccounts: {
        limit: 1,
        where: { testUserId },
        with: {
          user: {
            columns: {
              email: true,
            },
          },
        },
      },
      oauthRegistrations: {
        where: {
          authorizations: { authorizationId },
        },
      },
    }).catch(() =>
      authenticate(
        "google",
        `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
      ),
    );

    const registration = user.oauthRegistrations[0];
    if (!registration) {
      return "You do not own this OAuth client.";
    }

    // Only a Testing app asks its owner to pick a test account. On an app
    // that is In production everyone signs in as themselves (Q164), so none
    // mints a session for a test account.
    if (registration.status !== "testing") {
      return "Only Testing apps approve as a test account.";
    }

    if (!user.testAccounts[0]?.user.email) {
      return "User does not have an email.";
    }

    // Generate a magic link and exchange it for a session.
    const { data: magicLink, error: magicLinkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: user.testAccounts[0]?.user.email,
      });

    if (magicLinkError ?? !magicLink.properties.hashed_token) {
      console.error({ magicLinkError });
      throw new Error("Failed to generate magic link");
    }

    const testAccountClient = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: true },
    });

    const { data: otp, error: otpError } =
      await testAccountClient.auth.verifyOtp({
        token_hash: magicLink.properties.hashed_token,
        type: "magiclink",
      });

    if (otpError ?? !otp.session) {
      console.error({ otpError });
      throw new Error("Failed to exchange magic link for session");
    }

    // The magic-link session exists only to approve this one authorization.
    // Revoke it as soon as that is done so a full session for the test
    // account never outlives the request; the client's own token comes from
    // the code exchange and is issued (and restricted) separately.
    let redirectUrl: string;
    try {
      redirectUrl = await approveAuthorization(
        testAccountClient,
        authorizationId,
      );
    } finally {
      await testAccountClient.auth.signOut({ scope: "local" });
    }

    redirect(redirectUrl);
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    return err instanceof Error ? err.message : "Authorization failed";
  }
}

export async function denyOAuthAuthorization(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const parsed = denySchema.safeParse(formData);
  if (!parsed.success)
    return parsed.error.issues[0]?.message ?? "Invalid form data";

  const { authorizationId: authorizationId } = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.oauth.denyAuthorization(
      authorizationId,
      {
        skipBrowserRedirect: true,
      },
    );
    if (error ?? !data.redirect_url)
      throw new Error("Failed to deny authorization");
    redirect(data.redirect_url);
  } catch (err) {
    unstable_rethrow(err);
    return err instanceof Error ? err.message : "Failed to deny authorization";
  }
}
