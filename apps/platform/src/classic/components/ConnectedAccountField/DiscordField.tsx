"use client";

import { DiscordLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkDiscordProfile from "~/server/actions/linkDiscordProfile";
import unlinkDiscordProfile from "~/server/actions/unlinkDiscordProfile";
import ConnectedAccountField from ".";
import { discordUserName } from "./identity";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function DiscordField({ discordIdentity }: ProfileData) {
  return (
    <ConnectedAccountField
      accountName={discordUserName(discordIdentity?.identityData)}
      unlinkEffect="you're removed from the DevDogs server."
      linkAction={linkDiscordProfile}
      unlinkAction={unlinkDiscordProfile}
      unlinkTitle="Unlink Discord"
      unlinkDescription="Unlinking your Discord account will remove you from the DevDogs server, and un-verify your account until you link Discord again."
      linkIcon={<DiscordLogoIcon aria-hidden />}
      linkLabel="Link Discord"
      notLinkedLabel="Not connected"
    />
  );
}
