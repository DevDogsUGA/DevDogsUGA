import { TrashIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import { formatDeletionDate } from "~/server/accountDeletion/dates";
import { keepMyAccount } from "~/server/actions/accountDeletion";
import Callout from "~/ui/callout";
import { Card } from "~/ui/card";
import { TextLink } from "~/ui/text-link";

import "./account-deletion.css";

/**
 * The pending page: "Your account is scheduled for deletion on <date>", with
 * Keep my account. A member lands here on sign-in while a deletion is
 * pending (account-deletion Q4); a deletion the job has already started shows
 * the same date with nothing to press, because it can no longer be undone.
 *
 * The date is formatted on the server in Eastern time, so it reads the same as
 * in the email.
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
    <section className="acctdel">
      <div className="wrap acctdel-wrap">
        <div className="eyebrow k">Account</div>
        <h1>Your account is scheduled for deletion on {date}</h1>
        <p className="lead">
          {requestedByOfficer
            ? "A DevDogs officer scheduled this. "
            : "You asked for this. "}
          We signed you out of every device when this was scheduled, and your
          profile is hidden. On that date your account and the personal content
          attached to it are permanently deleted.
        </p>

        <Card className="acctdel-card" kind="info">
          {started ? (
            <Callout tone="warning" title="The deletion has started.">
              It can no longer be undone. Check your UGA email for a
              confirmation when it finishes.
            </Callout>
          ) : (
            <>
              <h2 className="card-title">Changed your mind?</h2>
              <p className="muted">
                Keep your account and nothing is lost: your profile, attendance
                and settings come back exactly as they were.
              </p>
              <form action={keepMyAccount} className="acctdel-actions">
                <FormButton theme="cyan" size="lg" type="submit">
                  Keep my account
                </FormButton>
              </form>
            </>
          )}
        </Card>

        <div className="acctdel-notes">
          <h2 className="card-title">
            <TrashIcon weight="bold" aria-hidden /> What deleting does not cover
          </h2>
          <ul>
            <li>
              Leaving the DevDogs GitHub organization and Discord server is
              yours to do; we cannot remove you from accounts you manage. Your
              posts and contributions there stay.
              {hasGithub || hasDiscord ? (
                <>
                  {" "}
                  Leave
                  {hasGithub ? (
                    <>
                      {" "}
                      <TextLink href="https://github.com/settings/organizations">
                        the GitHub organization
                      </TextLink>
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
              ) : null}
            </li>
            <li>
              Copies held by Bevy, Engage and UGA stay there. DevDogs apps
              outside the platform, DogDays and DogPack among them, delete their
              own copies on a best-effort basis.
            </li>
            <li>
              Questions? Ask in <TextLink href="/help">the help forum</TextLink>
              .
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
