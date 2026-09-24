"use client";

import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

/**
 * How a lead gets somebody specific onto the team.
 *
 * There is no member directory to search or pick from -- see
 * `resolveInvitee` in `server/actions/teams.ts` -- so this is one field, an
 * exact email or GitHub username, not a picker. A miss is not a bug to
 * report; it means the person has not signed up on the platform yet, or
 * signed up but never linked GitHub, and the failure message says so rather
 * than reading like an error.
 *
 * A sent invite is not confirmation the right person got it -- it is
 * confirmation a request row was created for whichever account matched.
 * `/teams/requests` is where the invitee actually answers, and the email
 * this fires (`teamInvite`, best-effort -- see `notifyInvitee`) is the other
 * way they hear about it.
 */
export default function InviteForm({
  teamId,
  inviteToTeam,
}: {
  teamId: string;
  inviteToTeam: (
    teamId: string,
    identifier: string,
  ) => Promise<TeamActionOutcome<string>>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <h2 className="font-semibold text-white">Invite somebody</h2>
      <p className="max-w-prose text-sm text-mauve-400">
        Their exact email or GitHub username -- there is no directory to search.
        They will see it on{" "}
        <span className="font-semibold text-white">/teams/requests</span>, and
        get an email too.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setProblem(null);
          setSent(null);
          startTransition(async () => {
            const sentIdentifier = identifier.trim();
            const result = await inviteToTeam(teamId, sentIdentifier);
            if (!result.ok) {
              setProblem(result.code);
              return;
            }
            setIdentifier("");
            setSent(sentIdentifier);
          });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-semibold text-white">
            Email or GitHub username
          </span>
          <input
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setSent(null);
            }}
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="ada@uga.edu or adalovelace"
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          />
        </label>
        <button
          type="submit"
          disabled={identifier.trim().length === 0 || isPending}
          className="rounded-sm border-2 border-white bg-white px-4 py-2 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
        >
          {isPending ? "Inviting…" : "Invite"}
        </button>
      </form>

      {sent && (
        <p role="status" className="text-sm text-mauve-300">
          Invited {sent}. It shows up on their{" "}
          <span className="font-semibold text-white">/teams/requests</span>{" "}
          page, and they get an email too.
        </p>
      )}

      {problem && <TeamProblem code={problem} />}
    </div>
  );
}
