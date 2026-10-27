import { Heading, Muted, Paragraph } from "../components/Heading.js";
import { Layout } from "../components/Layout.js";

/**
 * The deletion finished. Goes to the UGA address the account used, once, after
 * the account is gone. There is nothing to click: it can no longer be undone.
 */
export type Props = {
  name: string;
};

export const subject = () => "Your DevDogs account has been deleted";

export default function AccountDeletionComplete(p: Props) {
  return (
    <Layout preview="Your DevDogs account has been deleted.">
      <Heading>Your account has been deleted</Heading>

      <Paragraph>
        Hi {p.name} — your DevDogs account and the personal content attached to
        it have been permanently deleted.
      </Paragraph>

      <Paragraph>
        If you joined the DevDogs GitHub organization or Discord server, leave
        them yourself; we cannot remove you from services you manage.
      </Paragraph>

      <Muted>
        You are welcome back any time. Signing in again creates a new, empty
        account.
      </Muted>
    </Layout>
  );
}
