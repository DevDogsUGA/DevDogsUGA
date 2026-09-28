import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import z from "zod";
import { env } from "~/env";
import { installationToken } from "~/server/github/client";
import { db } from "~/server/db";
import { leaderboardProfiles } from "~/server/db/schema";
import { createSupabaseServerClient } from "~/supabase/server";
import {
  isSuccessfulGitHubInvitation,
  isSuccessfulRemovalStatus,
} from "~/server/auth/connectedAccount";

const CALLBACK_URL = new URL("/auth/callback", env.BASE_URL).toString();

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
 * Where a linked GitHub account stands in the DevDogs organization once
 * `linkProfile` returns. `"invitation_pending"` means the invitation exists but
 * could not be accepted on the user's behalf, so they have to accept it on
 * GitHub themselves.
 */
export type OrgMembershipOutcome = "member" | "invitation_pending";

/**
 * Fetches the GitHub profile, invites the user to the DevDogs organization,
 * and upserts the profile into `leaderboardProfiles`. Supabase owns the
 * identity link itself, in `auth.identities`.
 * @param accessToken The GitHub access token from the Supabase OAuth session.
 * @see `requestAuthorization`
 */
export async function linkProfile(
  accessToken: string,
): Promise<OrgMembershipOutcome> {
  const profile = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "Bearer " + accessToken,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
    .then(async (res) => {
      if (!res.ok) throw githubApiError("read_profile", res);
      const body: unknown = await res.json();
      return body;
    })
    .then((obj) => profileSchema.parseAsync(obj));

  // Records the GitHub identity against the member, and nothing more. This is
  // persisted before optional organization membership work so that a GitHub
  // API failure cannot lose the mapping established by the identity link.
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

  // An existing member is already where the link is trying to put them. Asking
  // first keeps their OAuth token away from the org, where the accept call
  // below can be refused (OAuth App access restrictions) for no reason that
  // matters to them.
  const state = await orgMembershipState(profile.login);
  if (state === "active") return "member";

  if (state === null) {
    // Invite the GitHub user as a contributor to the DevDogs organization.
    // Authenticated as the DevDogs App: an installation token that expires in
    // an hour, rather than an org owner's `ghp_` token that does not expire.
    const invitation = await fetch(
      `https://api.github.com/orgs/${env.GITHUB_ORG}/invitations`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await installationToken()),
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          invitee_id: profile.id,
          role: "direct_member",
          team_ids: [14192632],
        }),
      },
    );
    // A specific 422 body means membership or an invitation already exists.
    // Other 422 validation failures remain errors.
    if (!(await isSuccessfulGitHubInvitation(invitation))) {
      throw githubApiError("invite_org_member", invitation);
    }
  }

  // Accept the organization invitation on behalf of the user
  const membership = await fetch(
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
  );
  if (membership.ok) return "member";

  // The invitation stands either way; only the shortcut failed. The member can
  // accept it on GitHub, which is a next step, not an error.
  githubApiError("activate_org_membership", membership);
  return "invitation_pending";
}

/**
 * Reads a user's DevDogs organization membership as the App.
 * @returns `"active"` or `"pending"`, or `null` when there is no membership.
 */
async function orgMembershipState(
  login: string,
): Promise<"active" | "pending" | null> {
  const response = await fetch(
    `https://api.github.com/orgs/${env.GITHUB_ORG}/memberships/${login}`,
    {
      headers: {
        Authorization: "Bearer " + (await installationToken()),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw githubApiError("read_org_membership", response);
  const { state } = orgMembershipSchema.parse(await response.json());
  return state;
}

const orgMembershipSchema = z.object({
  state: z.enum(["active", "pending"]),
});

/**
 * Removes a GitHub user from the DevDogs organization and unlinks their GitHub
 * identity from Supabase. The `leaderboardProfiles` row survives, since it is
 * the GitHub-account-to-member mapping.
 * The GitHub login comes from `identity_data.user_name`, which Supabase stores
 * at link time.
 */
export async function unlinkProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error: identitiesError } =
    await supabase.auth.getUserIdentities();
  if (identitiesError) {
    throw new Error(
      `Failed to read GitHub identity: ${identitiesError.message}`,
    );
  }
  const identity = data?.identities.find((i) => i.provider === "github");

  if (!identity) return;

  const login: unknown = identity.identity_data?.user_name;

  // Unlink first. Organization membership is an external side effect and an
  // already-absent member must not strand the identity.
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) {
    throw new Error(`Failed to unlink GitHub identity: ${error.message}`);
  }

  if (typeof login !== "string") {
    console.error(
      JSON.stringify({
        message: "Connected-account side effect failed",
        provider: "github",
        operation: "remove_org_member",
        error: "Identity is missing user_name",
      }),
    );
    return;
  }

  try {
    const result = await fetch(
      `https://api.github.com/orgs/${env.GITHUB_ORG}/memberships/${login}`,
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + (await installationToken()),
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!isSuccessfulRemovalStatus(result.status)) {
      githubApiError("remove_org_member", result);
    }
  } catch (cause) {
    console.error(
      JSON.stringify({
        message: "Connected-account side effect failed",
        provider: "github",
        operation: "remove_org_member",
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
}

function githubApiError(operation: string, response: Response): Error {
  console.error(
    JSON.stringify({
      message: "Connected-account side effect failed",
      provider: "github",
      operation,
      status: response.status,
      requestId: response.headers.get("x-github-request-id"),
    }),
  );
  return new Error(`GitHub ${operation} failed (${response.status})`);
}
