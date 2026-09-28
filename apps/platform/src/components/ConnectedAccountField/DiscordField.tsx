"use client";

import { GameControllerIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkDiscordProfile from "~/server/actions/linkDiscordProfile";
import unlinkDiscordProfile from "~/server/actions/unlinkDiscordProfile";
import ConnectedAccountField from ".";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * Supabase's Discord provider writes no `user_name` (GitHub's does). The
 * Discord username lands in `full_name`; `name` is the legacy `username#0`.
 */
function getIdentityUserName(identityData: unknown): string | undefined {
  return identityData &&
    typeof identityData === "object" &&
    "full_name" in identityData &&
    typeof identityData.full_name === "string"
    ? identityData.full_name
    : undefined;
}

export default function DiscordField({
  id,
  discordIdentity,
  profile,
}: ProfileData) {
  return (
    <ConnectedAccountField
      userId={id}
      accountName={getIdentityUserName(discordIdentity?.identityData)}
      provider="discord"
      visibilityState={profile}
      linkAction={linkDiscordProfile}
      unlinkAction={unlinkDiscordProfile}
      unlinkTitle="Unlink Discord"
      unlinkDescription="Unlinking your Discord account will remove you from the DevDogs server."
      linkLabel="Sign in with Discord"
      linkIcon={<GameControllerIcon />}
      notLinkedLabel="Discord not linked."
    />
  );
}
