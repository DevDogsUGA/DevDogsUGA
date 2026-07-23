"use client";

import { LinkedinLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkLinkedinProfile from "~/server/actions/linkLinkedinProfile";
import unlinkLinkedinProfile from "~/server/actions/unlinkLinkedinProfile";
import ConnectedAccountField from ".";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

function getIdentityName(identityData: unknown): string | undefined {
  if (!identityData || typeof identityData !== "object") return undefined;
  if ("name" in identityData && typeof identityData.name === "string") {
    return identityData.name;
  }
  const given =
    "given_name" in identityData && typeof identityData.given_name === "string"
      ? identityData.given_name
      : "";
  const family =
    "family_name" in identityData && typeof identityData.family_name === "string"
      ? identityData.family_name
      : "";
  const full = [given, family].filter(Boolean).join(" ");
  return full || undefined;
}

export default function LinkedinField({ id, linkedinIdentity, profile }: ProfileData) {
  return (
    <ConnectedAccountField
      userId={id}
      accountName={getIdentityName(linkedinIdentity?.identityData)}
      provider="linkedin"
      visibilityState={profile}
      linkAction={linkLinkedinProfile}
      unlinkAction={unlinkLinkedinProfile}
      unlinkTitle="Unlink LinkedIn"
      unlinkDescription="Unlinking your LinkedIn account will remove it from your DevDogs profile."
      linkLabel="Sign in with LinkedIn"
      linkIcon={<LinkedinLogoIcon />}
      notLinkedLabel="LinkedIn not linked."
    />
  );
}
