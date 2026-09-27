import { Button } from "../components/Button.js";
import { Heading, Muted, Paragraph } from "../components/Heading.js";
import { Layout } from "../components/Layout.js";

/**
 * A team lead invited someone to join their team.
 *
 * Team formation happens between meetings, when nobody is looking at the site,
 * and a competition week is short enough that missing an invitation by a few
 * days means missing it. So invitations are email, not only a badge in the
 * UI.
 *
 * No `competitionName`: teams are persistent now, not scoped to one
 * competition (see `server/actions/teams.ts`'s module doc), so an invitation
 * is to the TEAM, not to a competition roster.
 *
 * Nothing below branches on props. See `scripts/compile`: the compiler renders
 * with a Proxy that returns a sentinel for every access, so a conditional
 * always takes the truthy path and bakes that one branch into the shipped
 * artifact. A variant is a separate template.
 */
export type Props = {
  inviteeName: string;
  teamName: string;
  leadName: string;
  acceptUrl: string;
};

export const subject = (p: Props) => `${p.teamName} invited you to join`;

export default function TeamInvite(p: Props) {
  return (
    <Layout preview="A team lead invited you to join their team.">
      <Heading>You have been invited to {p.teamName}</Heading>

      <Paragraph>
        Hi {p.inviteeName} — {p.leadName} invited you to join {p.teamName}.
      </Paragraph>

      <Paragraph>
        <Button href={p.acceptUrl}>Review the invitation</Button>
      </Paragraph>

      <Muted>
        Accepting is checked at the moment you accept, not now: the team can
        fill up, the roster can lock, or you can already be active on as many
        teams as one contributor can be on at once. If any of that has happened
        the page will tell you which.
      </Muted>
    </Layout>
  );
}
