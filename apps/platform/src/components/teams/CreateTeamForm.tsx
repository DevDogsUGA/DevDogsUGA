"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { CreatedTeam } from "~/server/actions/teams";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

/**
 * Make a team, and lead it.
 *
 * The only field is a name. Everything else about a new team — its join code,
 * its GitHub team, its branch, the creator's membership as lead — is decided
 * by `createTeam`, and asking about any of it here would be asking a question
 * whose answer the member cannot change.
 */
export default function CreateTeamForm({
  competitionId,
  createTeam,
}: {
  competitionId: string;
  createTeam: (
    competitionId: string,
    name: string,
  ) => Promise<TeamActionOutcome<CreatedTeam>>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = name.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setProblem(null);
        startTransition(async () => {
          const result = await createTeam(competitionId, trimmed);
          if (!result.ok) {
            setProblem(result.code);
            return;
          }
          // Refresh rather than route to the new team: `createTeam` returns an
          // id and these routes are keyed by slug, so there is no href to send
          // them to. The refreshed page knows they are on a team and swaps
          // this form for the card that links to it.
          setName("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 rounded-sm border-2 border-black bg-white p-4"
    >
      <h2 className="font-semibold">Start a team</h2>
      <p className="text-sm opacity-70">
        You lead the team you create, which means you answer join requests and
        cast your team&rsquo;s ballot. Everybody else gets in with the join code
        or an invitation.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Team name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
          placeholder="The Rubber Ducks"
          className="rounded-sm border-2 border-black px-3 py-2"
        />
      </label>

      {problem && <TeamProblem code={problem} />}

      <button
        type="submit"
        disabled={trimmed.length === 0 || isPending}
        className="self-start rounded-sm border-2 border-black bg-black px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {isPending ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}
