"use client";

import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";
import linkGithubProfile from "~/server/actions/linkGithubProfile";
import unlinkGithubProfile from "~/server/actions/unlinkGithubProfile";
import ConnectedAccountField from ".";
import { githubUserName } from "./identity";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function GithubField({ githubIdentity }: ProfileData) {
  return (
    <ConnectedAccountField
      accountName={githubUserName(githubIdentity?.identityData)}
      unlinkEffect="your account is un-verified until you link one again, and your development OAuth clients are deleted. Their client IDs and secrets stop working for good."
      linkAction={linkGithubProfile}
      unlinkAction={unlinkGithubProfile}
      unlinkTitle="Unlink GitHub"
      unlinkDescription="Unlinking your GitHub account will un-verify your account until you link one again. If you have an active development OAuth client, it will be deleted, and your existing client ID and secret will be permanently invalidated."
      linkIcon={<GithubLogoIcon aria-hidden />}
      linkLabel="Link GitHub"
      notLinkedLabel="Not connected"
      displayPrefix="github.com/"
    />
  );
}
