"use client";

import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkGithubProfile from "~/server/actions/linkGithubProfile";
import unlinkGithubProfile from "~/server/actions/unlinkGithubProfile";
import ConnectedAccountField from ".";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

function getIdentityUserName(identityData: unknown): string | undefined {
  return identityData &&
    typeof identityData === "object" &&
    "user_name" in identityData &&
    typeof identityData.user_name === "string"
    ? identityData.user_name
    : undefined;
}

export default function GithubField({ id, githubIdentity, profile }: ProfileData) {
  return (
    <ConnectedAccountField
      userId={id}
      accountName={getIdentityUserName(githubIdentity?.identityData)}
      provider="github"
      visibilityState={profile}
      linkAction={linkGithubProfile}
      unlinkAction={unlinkGithubProfile}
      unlinkTitle="Unlink GitHub"
      unlinkDescription="Unlinking your GitHub account will remove you from the DevDogs organization and revoke your access to this year's project repositories. If you have an active OAuth client, it will be deleted, and your existing client ID and secret will be permanently invalidated."
      linkLabel="Sign in with GitHub"
      linkIcon={<GithubLogoIcon />}
      notLinkedLabel="GitHub not linked."
      displayPrefix="github.com/"
    />
  );
}
