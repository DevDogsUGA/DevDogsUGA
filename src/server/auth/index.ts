import { db } from "~/server/db";
import { createSupabaseServerClient } from "~/supabase/server";
import * as discord from "./providers/discord";
import * as github from "./providers/github";
import * as google from "./providers/google";
import * as linkedin from "./providers/linkedin";
import { redirect } from "next/navigation";

/**
 * Starts the OAuth flow with a specified provider.
 * @param provider One of `"google"`, `"discord"`, or `"github"`
 * @param callbackPath Where to navigate the user after the OAuth flow is complete
 */
export async function authenticate(
  provider: "google" | "discord" | "github" | "linkedin_oidc",
  callbackPath: string,
): Promise<never> {
  if (provider !== "google") {
    await expectSession().catch(() => redirect("/auth"));
  }

  switch (provider) {
    case "google":
      return await google.requestAuthorization(callbackPath);
    case "discord":
      return await discord.requestAuthorization(callbackPath);
    case "github":
      return await github.requestAuthorization(callbackPath);
    case "linkedin_oidc":
      return await linkedin.requestAuthorization(callbackPath);
  }
}

/**
 * Returns the currently signed-in user with the requested relations.
 * Throws if the user is not signed in or has no DevDogs profile.
 * Always includes `id`, `email`, and `rawUserMetaData` from `auth.users`.
 * @param include Drizzle relational query `with` clause for the auth user record.
 * @returns The auth user with the requested relations.
 */
export async function expectUserWith<
  T extends (Parameters<typeof db.query.usersInAuth.findFirst>[0] & {})["with"],
>(include: T) {
  const id = await expectSession();

  if (!id) {
    throw new Error("Session expected but not found.");
  }

  const user = await db.query.usersInAuth.findFirst({
    columns: { id: true, email: true, rawUserMetaData: true },
    where: { id },
    with: include,
  });

  if (!user) {
    throw new Error("User expected but not found.");
  }

  return user;
}

/**
 * Asserts that a valid Supabase session exists.
 * Throws if the user is not signed in.
 * @returns The id of the signed-in user.
 */
export async function expectSession() {
  const supabase = await createSupabaseServerClient();
  const session = await supabase.auth.getClaims();

  if (!session.data) {
    throw new Error("Session expected but not found.");
  }

  return session.data.claims.sub;
}
