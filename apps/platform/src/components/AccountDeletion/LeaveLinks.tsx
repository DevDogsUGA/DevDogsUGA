import { TextLink } from "~/ui/text-link";

/** Where a member leaves the DevDogs GitHub organization themselves. */
export const GITHUB_LEAVE_URL = "https://github.com/settings/organizations";

/**
 * The direct links to leave the GitHub organization and the Discord server,
 * for whichever of the two accounts the member has linked (account-deletion
 * Q44). We cannot remove anyone from either: the member does it. Renders
 * nothing when neither is linked. Used by the pending page and by the delete
 * dialog, so both say the same thing.
 */
export default function LeaveLinks({
  hasGithub,
  hasDiscord,
  discordUrl,
}: {
  hasGithub: boolean;
  hasDiscord: boolean;
  discordUrl: string;
}) {
  if (!hasGithub && !hasDiscord) return null;
  return (
    <>
      {" "}
      Leave
      {hasGithub ? (
        <>
          {" "}
          <TextLink href={GITHUB_LEAVE_URL}>the GitHub organization</TextLink>
        </>
      ) : null}
      {hasGithub && hasDiscord ? " and" : null}
      {hasDiscord ? (
        <>
          {" "}
          <TextLink href={discordUrl}>the Discord server</TextLink>
        </>
      ) : null}
      .
    </>
  );
}
