"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { redirect, unstable_rethrow } from "next/navigation";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { env } from "~/env";
import { authenticate, expectUserWith } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";
import { createSupabaseServerClient } from "~/supabase/server";

const approveAsTestAccountSchema = zfd.formData({
  authorizationId: zfd.text(),
  testUserId: zfd.text(z.uuid()),
});

const denySchema = zfd.formData({
  authorizationId: zfd.text(),
});

export async function approveAuthorization(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, "public", "public", any, any>,
  authorizationId: string,
): Promise<never> {
  const { data: authorizationDetails, error: authorizationDetailsError } =
    await client.auth.oauth.getAuthorizationDetails(authorizationId);

  if (authorizationDetailsError ?? !authorizationDetails) {
    console.error({ authorizationDetailsError });
    throw new Error("Failed to approve authorization");
  }

  if ("redirect_url" in authorizationDetails) {
    // User has previously approved authorization
    redirect(authorizationDetails.redirect_url);
  }

  const { data: authorizationApproval, error: authorizationApprovalError } =
    await client.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });

  if (authorizationApprovalError ?? !authorizationApproval.redirect_url) {
    console.error({ error: authorizationApprovalError });
    throw new Error("Failed to approve authorization");
  }

  redirect(authorizationApproval.redirect_url);
}

export async function approveTestAccountAuthorization(
  _prevState: null | string,
  formData: FormData,
) {
  try {
    const { authorizationId, testUserId } =
      await approveAsTestAccountSchema.parseAsync(formData);

    // Verify the signed-in user owns the client this test account belongs to.
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
      oauthRegistration: {
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

    if (!user.oauthRegistration) {
      return "You do not own this OAuth client.";
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

    return await approveAuthorization(testAccountClient, authorizationId);
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
