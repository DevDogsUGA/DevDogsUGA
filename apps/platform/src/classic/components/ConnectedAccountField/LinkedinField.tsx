"use client";

import { LinkedinLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkLinkedinProfile from "~/server/actions/linkLinkedinProfile";
import unlinkLinkedinProfile from "~/server/actions/unlinkLinkedinProfile";
import ConnectedAccountField from ".";
import { linkedinName } from "./identity";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function LinkedinField({ linkedinIdentity }: ProfileData) {
  return (
    <ConnectedAccountField
      accountName={linkedinName(linkedinIdentity?.identityData)}
      unlinkEffect="it's removed from your DevDogs profile."
      linkAction={linkLinkedinProfile}
      unlinkAction={unlinkLinkedinProfile}
      unlinkTitle="Unlink LinkedIn"
      unlinkDescription="Unlinking your LinkedIn account will remove it from your DevDogs profile."
      linkIcon={<LinkedinLogoIcon aria-hidden />}
      linkLabel="Link LinkedIn"
      notLinkedLabel="Not connected"
    />
  );
}
