import { Button } from "../components/Button.js";
import { Heading, Muted, Paragraph } from "../components/Heading.js";
import { Layout } from "../components/Layout.js";

/**
 * Someone asked to join a team. Goes to the lead.
 *
 * The mirror of TeamInvite, and deliberately a separate template rather than
 * one with a `direction` prop: the compile step bakes a single render, so a
 * conditional would ship one branch to both audiences.
 */
export type Props = {
  leadName: string;
  applicantName: string;
  teamName: string;
  competitionName: string;
  reviewUrl: string;
};

export const subject = (p: Props) =>
  `${p.applicantName} asked to join ${p.teamName}`;

export default function JoinRequest(p: Props) {
  return (
    <Layout preview="Someone asked to join a team you lead.">
      <Heading>
        {p.applicantName} asked to join {p.teamName}
      </Heading>

      <Paragraph>
        Hi {p.leadName} — {p.applicantName} would like to join {p.teamName} for{" "}
        {p.competitionName}.
      </Paragraph>

      <Paragraph>
        <Button href={p.reviewUrl}>Review the request</Button>
      </Paragraph>

      <Muted>
        Answering does not commit you to a roster size — the competition&apos;s
        cap still applies, and the request is re-checked when you accept it.
      </Muted>
    </Layout>
  );
}
