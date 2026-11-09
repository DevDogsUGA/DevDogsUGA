import FormButton from "~/classic/components/FormButton";
import PageShell from "~/classic/components/PageShell";
import { formatDeletionDate } from "~/server/accountDeletion/dates";
import { keepMyAccount } from "~/server/actions/accountDeletion";
import Callout from "~/classic/ui/callout";
import { ConsoleCard } from "~/classic/ui/card";
import { TextLink } from "~/classic/ui/text-link";
import LeaveLinks from "./LeaveLinks";

/**
 * The pending page: "Your account is scheduled for deletion on <date>", with
 * Keep my account. A member lands here on sign-in while a deletion is
 * pending (account-deletion Q4); a deletion the job has already started shows
 * the same date with nothing to press, because it can no longer be undone.
 *
 * The date is formatted on the server in Eastern time, so it reads the same as
 * in the email. There is no baseline version of this page: it is the baseline
 * page shell and cards around today's copy and actions.
 */
export default function AccountDeletionPending({
  scheduledFor,
  requestedByOfficer,
  started,
  hasGithub,
  hasDiscord,
  discordUrl,
}: {
  scheduledFor: Date;
  /** An officer, not the member, scheduled it: say so, and say who to ask. */
  requestedByOfficer: boolean;
  /** The job has begun: Keep my account is no longer offered. */
  started: boolean;
  /** Which linked accounts to offer a leave link for. */
  hasGithub: boolean;
  hasDiscord: boolean;
  discordUrl: string;
}) {
  const date = formatDeletionDate(scheduledFor);
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="rose"
        title={`Your account is scheduled for deletion on ${date}`}
        description={
          <>
            {requestedByOfficer
              ? "A DevDogs officer scheduled this. "
              : "You asked for this. "}
            We signed you out of every device when this was scheduled, and your
            profile is hidden. On that date your account and the personal
            content attached to it are permanently deleted.
          </>
        }
      >
        <ConsoleCard.Root id="keep">
          <ConsoleCard.Header title="Changed your mind?" />
          <ConsoleCard.Content>
            {started ? (
              <Callout tone="warning" title="The deletion has started.">
                It can no longer be undone. Check your UGA email for a
                confirmation when it finishes.
              </Callout>
            ) : (
              <div className="flex flex-col items-start gap-4">
                <p className="max-w-prose text-sm text-mauve-300">
                  Keep your account and nothing is lost: your profile,
                  attendance and settings come back exactly as they were.
                </p>
                <form action={keepMyAccount}>
                  <FormButton theme="cyan" type="submit">
                    Keep my account
                  </FormButton>
                </form>
              </div>
            )}
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="not-covered">
          <ConsoleCard.Header title="What deleting does not cover" />
          <ConsoleCard.Content>
            <ul className="flex list-disc flex-col gap-2.5 pl-5 text-sm text-mauve-300">
              <li>
                Leaving the DevDogs GitHub organization and Discord server is
                yours to do; we cannot remove you from accounts you manage. Your
                posts and contributions there stay.
                <LeaveLinks
                  hasGithub={hasGithub}
                  hasDiscord={hasDiscord}
                  discordUrl={discordUrl}
                />
              </li>
              <li>
                Copies held by Bevy, Engage and UGA stay there. DevDogs apps
                outside the platform, DogDays and DogPack among them, delete
                their own copies on a best-effort basis.
              </li>
              <li>
                Questions? Ask in{" "}
                <TextLink href="/help">the help forum</TextLink>.
              </li>
            </ul>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </PageShell>
    </div>
  );
}
