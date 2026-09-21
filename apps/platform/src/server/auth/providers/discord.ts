import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DiscordAPIError } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import z from "zod";
import { env } from "~/env";
import { asBot, asUser } from "~/server/discord/api";
import { createSupabaseServerClient } from "~/supabase/server";
import { removeSyncedRolesOnUnlink } from "~/server/discord/memberSync";
import { isSuccessfulRemovalStatus } from "~/server/auth/connectedAccount";

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

  cookieStore.set("auth_intent", "link:discord", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "discord",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
      scopes: "identify guilds.join",
    },
  });

  if (error ?? !data.url) {
    throw new Error("Failed to initiate Discord OAuth via Supabase");
  }

  redirect(data.url);
}

const profileSchema = z.object({
  id: z.string(),
});

/**
 * Adds the linked Discord user to the DevDogs guild, with their preferred name
 * as the nickname. Supabase owns the identity link itself (`auth.identities`);
 * this is only the guild-join side effect, and it assigns no roles. Both Discord
 * calls go through the rate-limit-aware REST client, so a burst of links (a
 * meeting, an email blast) waits out Discord's rate limits instead of failing.
 * @param accessToken The Discord access token from the Supabase OAuth session.
 * @param preferredName Becomes the member's nickname in the guild.
 * @see `requestAuthorization`
 */
export async function linkProfile(
  accessToken: string,
  preferredName: string,
): Promise<void> {
  const { id: discordUserId } = profileSchema.parse(
    await asUser(accessToken).get(Routes.user()),
  );

  // `PUT` is idempotent here: Discord returns 204 when the user is already a
  // member, which the REST client treats as success rather than throwing.
  await asBot().put(Routes.guildMember(env.DISCORD_GUILD_ID, discordUserId), {
    body: { access_token: accessToken, nick: preferredName },
  });
}

/**
 * Removes a user's Discord identity from Supabase and removes them from the
 * DevDogs guild. The `provider_user_id` on the identity is the Discord
 * snowflake ID used for the guild API call.
 */
export async function unlinkProfile(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error: identitiesError } =
    await supabase.auth.getUserIdentities();
  if (identitiesError) {
    throw new Error(
      `Failed to read Discord identity: ${identitiesError.message}`,
    );
  }

  const identity = data?.identities.find((i) => i.provider === "discord");

  if (!identity) return;

  // The Discord snowflake ID is stored as `identity_data.sub` by Supabase.
  const discordUserId: unknown = identity.identity_data?.sub;

  // The identity is the user's account data. Its removal must not depend on
  // the optional guild-management side effect succeeding.
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) {
    throw new Error(`Failed to unlink Discord identity: ${error.message}`);
  }

  await removeSyncedRolesOnUnlink(userId).catch((cause: unknown) => {
    logDiscordFailure("remove_synced_roles", cause);
  });

  if (typeof discordUserId !== "string") {
    logDiscordFailure("remove_guild_member", "Identity is missing sub");
    return;
  }

  try {
    await asBot().delete(
      Routes.guildMember(env.DISCORD_GUILD_ID, discordUserId),
      { reason: "Unlinked Discord account on devdogsuga.org" },
    );
  } catch (cause) {
    // A member who is already gone (404) is a successful removal for us.
    if (
      cause instanceof DiscordAPIError &&
      isSuccessfulRemovalStatus(cause.status)
    ) {
      return;
    }
    logDiscordFailure("remove_guild_member", cause);
  }
}

function logDiscordFailure(operation: string, cause: unknown): void {
  console.error(
    JSON.stringify({
      message: "Connected-account side effect failed",
      provider: "discord",
      operation,
      error: cause instanceof Error ? cause.message : String(cause),
    }),
  );
}
