"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

/**
 * The three things an active member can do to their own membership: leave,
 * and -- if they lead -- hand the lead to somebody else or disband the team
 * outright.
 *
 * One component rather than three, because a lead sees all of it in one
 * place and the "are you sure" framing is shared: every action here is
 * destructive to the caller's own standing on the team (or, for disband, to
 * the team itself), so each confirms before firing.
 */
export default function RosterActions({
  teamId,
  isLead,
  otherMembers,
  leaveTeam,
  transferLead,
  disbandTeam,
}: {
  teamId: string;
  isLead: boolean;
  /** Other active members, for the transfer picker. Empty hides it. */
  otherMembers: { userId: string; label: string }[];
  leaveTeam: (teamId: string) => Promise<TeamActionOutcome<void>>;
  transferLead: (
    teamId: string,
    newLeadId: string,
  ) => Promise<TeamActionOutcome<void>>;
  disbandTeam: (teamId: string) => Promise<TeamActionOutcome<void>>;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [newLeadId, setNewLeadId] = useState(otherMembers[0]?.userId ?? "");
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<TeamActionOutcome<unknown>>) {
    setProblem(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setProblem(result.code);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <h2 className="font-semibold text-white">Your membership</h2>

      {isLead && otherMembers.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-white">Transfer the lead</span>
            <select
              value={newLeadId}
              onChange={(event) => setNewLeadId(event.target.value)}
              className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
            >
              {otherMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={isPending || newLeadId === ""}
            onClick={() => run(() => transferLead(teamId, newLeadId))}
            className="rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
          >
            Transfer
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* A lead with teammates still on the roster cannot leave -- see
            `leaveTeamImpl`'s `lead_must_transfer_first` -- so the button is
            offered regardless and the server's refusal explains it, rather
            than this component re-deriving the same rule to hide it. */}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (confirm("Leave this team?")) run(() => leaveTeam(teamId));
          }}
          className="rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
        >
          Leave team
        </button>

        {isLead && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (
                confirm(
                  "Disband this team? This deletes it, its branch's push access, and every pending request. The branch and its pull requests stay in git.",
                )
              ) {
                run(() => disbandTeam(teamId));
              }
            }}
            className="rounded-lg border border-red-500/60 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 transition-colors outline-none hover:border-red-400 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
          >
            Disband team
          </button>
        )}
      </div>

      {problem && <TeamProblem code={problem} />}
    </div>
  );
}
