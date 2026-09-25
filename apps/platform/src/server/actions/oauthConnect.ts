"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { authenticate, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { oauthConnectCodes, oauthRegistrations } from "~/server/db/schema";
import { generateConnectCode } from "~/server/oauth/connectCodes";
import { parseConnectParams } from "~/server/oauth/connectParams";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * The consent step of the `devtools oauth` connect handoff. The five hidden
 * fields below are exactly `/tools/oauth/connect`'s query string, round-
 * tripped through the consent form -- see that page for where they came
 * from and `~/server/oauth/connectParams` for what "valid" means for each.
 */
const connectSchema = zfd.formData({
  redirectUri: zfd.text(z.string().min(1)),
  codeChallenge: zfd.text(z.string().min(1)),
  state: zfd.text(z.string().min(1)),
  label: zfd.text(z.string().min(1)),
  callbackUri: zfd.text(z.string().min(1)),
});

/** The connect page's own URL for these params, for the sign-in round trip. */
function connectPath(fields: z.infer<typeof connectSchema>): string {
  const qs = new URLSearchParams({
    redirect_uri: fields.redirectUri,
    code_challenge: fields.codeChallenge,
    code_challenge_method: "S256",
    state: fields.state,
    label: fields.label,
    callback_uri: fields.callbackUri,
  });
  return `/tools/oauth/connect?${qs.toString()}`;
}

function redirectWith(
  redirectUri: string,
  params: Record<string, string>,
): never {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  redirect(url.toString());
}

export async function denyConnect(formData: FormData): Promise<void> {
  const fields = connectSchema.parse(formData);
  redirectWith(fields.redirectUri, {
    error: "access_denied",
    state: fields.state,
  });
}

export async function approveConnect(formData: FormData): Promise<void> {
  const fields = connectSchema.parse(formData);

  // Re-validate: this is a plain server action endpoint, reachable by any
  // POST that supplies the same field names, not only by submitting the
  // page that already validated them.
  const parsed = parseConnectParams({
    redirect_uri: fields.redirectUri,
    code_challenge: fields.codeChallenge,
    code_challenge_method: "S256",
    state: fields.state,
    label: fields.label,
    callback_uri: fields.callbackUri,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const { redirectUri, codeChallenge, label, callbackUri } = parsed.params;

  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", connectPath(fields)));

  if (!user.githubIdentity) {
    throw new Error(
      "A linked GitHub account is required to connect an OAuth client",
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
    client_name: label,
    redirect_uris: [callbackUri],
    scope: "openid email profile",
  });
  if (error ?? !data?.client_secret) {
    throw new Error("Failed to create OAuth client");
  }

  await db
    .insert(oauthRegistrations)
    .values({ userId: user.id, clientId: data.client_id, label });

  const { code, codeHash } = generateConnectCode();
  await db.insert(oauthConnectCodes).values({
    codeHash,
    codeChallenge,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    userId: user.id,
    redirectUri,
  });

  redirectWith(redirectUri, { code, state: fields.state });
}
