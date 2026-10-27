import { Button } from "../components/Button.js";
import { Heading, Muted, Paragraph } from "../components/Heading.js";
import { Layout } from "../components/Layout.js";

/**
 * An officer added someone to a meeting's attendance by their UGA address, and
 * that address has no DevDogs account yet. The link signs them in with UGA SSO
 * (which creates the account) and records the attendance.
 *
 * Single use, and only the invited address can claim it: the page the link
 * opens refuses any other signed-in account.
 */
export type Props = {
  meetingTitle: string;
  whenLine: string;
  claimUrl: string;
  expiresDate: string;
};

export const subject = (p: Props) =>
  `Confirm your attendance at ${p.meetingTitle}`;

export default function AttendanceInvite(p: Props) {
  return (
    <Layout preview="An officer recorded you at a DevDogs meeting. Confirm it with your UGA sign-in.">
      <Heading>Confirm your attendance</Heading>

      <Paragraph>
        An officer marked you as having attended {p.meetingTitle} ({p.whenLine}
        ). Sign in with your UGA Google account to create your DevDogs account
        and put it on your record.
      </Paragraph>

      <Paragraph>
        <Button href={p.claimUrl}>Confirm attendance</Button>
      </Paragraph>

      <Muted>
        The link works once and only with this UGA address, and it expires on{" "}
        {p.expiresDate}. If you were not at this meeting, ignore this message
        and nothing is recorded.
      </Muted>
    </Layout>
  );
}
