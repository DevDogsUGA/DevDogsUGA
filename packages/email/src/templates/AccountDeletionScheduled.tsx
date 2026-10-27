import { Button } from "../components/Button.js";
import { Heading, Muted, Paragraph } from "../components/Heading.js";
import { Layout } from "../components/Layout.js";

/**
 * A member's account is scheduled for deletion. Goes to their UGA address, the
 * moment it is scheduled, whether they asked or an officer did.
 *
 * `requestedLine` is a whole sentence the sender composes ("You asked to delete
 * your account." / "A DevDogs officer scheduled your account for deletion."),
 * because this package bakes one render: a template cannot branch on who asked,
 * and two near-identical templates would drift. `scheduledDate` is already
 * formatted for a person ("Friday, November 6, 2026").
 */
export type Props = {
  name: string;
  requestedLine: string;
  scheduledDate: string;
  keepUrl: string;
};

export const subject = (p: Props) =>
  `Your DevDogs account will be deleted on ${p.scheduledDate}`;

export default function AccountDeletionScheduled(p: Props) {
  return (
    <Layout preview="Your DevDogs account is scheduled for deletion.">
      <Heading>Your account is scheduled for deletion</Heading>

      <Paragraph>
        Hi {p.name} — {p.requestedLine}
      </Paragraph>

      <Paragraph>
        On {p.scheduledDate} your DevDogs account and the personal content
        attached to it will be permanently deleted. Until then you are signed
        out and your profile is hidden.
      </Paragraph>

      <Paragraph>
        Changed your mind? Sign in and keep your account. Nothing is lost if you
        do it before that date.
      </Paragraph>

      <Paragraph>
        <Button href={p.keepUrl}>Keep my account</Button>
      </Paragraph>

      <Muted>
        After the date nobody can undo the deletion. Copies held by Bevy, Engage
        and UGA are not ours to delete. We tell every DevDogs app to delete its
        copy of your data, but that is best effort: we cannot guarantee each app
        does.
      </Muted>
    </Layout>
  );
}
