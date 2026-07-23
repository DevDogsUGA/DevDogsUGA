import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import z from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
import { leaderboardProfiles } from '~/server/db/schema';
import { createSupabaseServerClient } from "~/supabase/server";

const CALLBACK_URL = new URL("/api/auth/callback", env.BASE_URL).toString();

export async function requestAuthorization(
  callbackPath: string,
): Promise<never> {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient();

  // Store the post-auth destination in a short-lived cookie so the callback
  // handler can redirect there after the Supabase round-trip.
  cookieStore.set("auth_callback_path", callbackPath, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("auth_intent", "link:github", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
      scopes: "write:org user:email",
      queryParams: {
        access_type: "offline",
      },
    },
  });

  if (error ?? !data.url) {
    console.error({ data, error });
    throw new Error("Failed to initiate GitHub OAuth via Supabase");
  }

  redirect(data.url);
}

const profileSchema = z.object({
  id: z.int(),
  login: z.string(),
  avatar_url: z.string(),
});

/**
 * Fetches the GitHub profile, invites the user to the DevDogs organization,
 * and upserts the profile into the `github_profile` table. The identity link
 * itself is managed by Supabase (`auth.identities`).
 * @param accessToken The GitHub access token from the Supabase OAuth session.
 * @see `requestAuthorization`
 */
export async function linkProfile(accessToken: string): Promise<void> {
  const profile = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "Bearer " + accessToken,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
    .then((res) => res.json())
    .then((obj) => profileSchema.parseAsync(obj));

  // Invite the GitHub user as a contributor to the DevDogs organization
  await fetch(`https://api.github.com/orgs/${env.GITHUB_ORG}/invitations`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      invitee_id: profile.id,
      role: "direct_member",
      team_ids: [14192632],
    }),
  })
    .then((res) => res.json())
    .catch(console.error);

  // Accept the organization invitation on behalf of the user
  await fetch(
    "https://api.github.com/user/memberships/orgs/" + env.GITHUB_ORG,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ state: "active" }),
    },
  )
    .then((res) => res.json())
    .catch(console.error);

  await db
    .insert(leaderboardProfiles)
    .values({
      githubId: String(profile.id),
      githubLogin: profile.login,
      avatarUrl: profile.avatar_url,
    })
    .onConflictDoUpdate({
      target: leaderboardProfiles.githubId,
      set: {
        githubLogin: sql`excluded."githubLogin"`,
        avatarUrl: sql`excluded."avatarUrl"`,
      },
    });
}

/**
 * Removes a GitHub user from the DevDogs organization and unlinks their
 * GitHub identity from Supabase. The `github_profile` row is preserved so
 * that leaderboard data is not lost.
 * The GitHub login is read from `identity_data.user_name`, stored by Supabase
 * at link time.
 */
export async function unlinkProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUserIdentities();
  const identity = data?.identities.find((i) => i.provider === "github");

  if (!identity) return;

  const login: unknown = identity.identity_data?.user_name;

  if (typeof login !== "string") {
    throw new Error("GitHub identity is missing user_name. Unlink aborted.");
  }

  const result = await fetch(
    `https://api.github.com/orgs/${env.GITHUB_ORG}/memberships/${login}`,
    {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + env.GITHUB_TOKEN,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!result.ok) {
    throw new Error(
      `Failed to remove user from GitHub org (${result.status}). Unlink aborted.`,
    );
  }

  await supabase.auth.unlinkIdentity(identity);
}
