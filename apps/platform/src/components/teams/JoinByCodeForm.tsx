"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

export interface JoinTarget {
  id: string;
  name: string;
  /** `teams.acceptingRequests` — a team may close itself to strangers. */
  acceptingRequests: boolean;
}

/**
 * The two ways onto a team you are not on.
 *
 * Both live in one component because they are one decision — "get me onto this
 * team" — and because they are the same fallback for each other: the code is
 * instant and needs somebody to have given it to you, the request is not
 * instant and needs nobody. Splitting them puts the answer to "I don't have a
 * code" on a different part of the page from the question.
 *
 * The team PICKER is here for a duller reason. `joinTeam` takes a team id and
 * a code, and nothing resolves a code on its own to the team it belongs to —
 * so on the competition-wide list the member has to say which team they are
 * joining as well as prove it. Where the page already knows the team (a team's
 * own page) it passes one target and the picker collapses to a label.
 */
export default function JoinByCodeForm({
  targets,
  joinTeam,
  requestToJoin,
}: {
  /** Rosters that are actually open. A locked team is not a target. */
  targets: JoinTarget[];
  joinTeam: (
    teamId: string,
    joinCode: string,
  ) => Promise<TeamActionOutcome<void>>;
  /**
   * Returns the request id on success. The message is optional at the action —
   * an all-whitespace note is normalized to absent there rather than here, so
   * this passes whatever was typed.
   */
  requestToJoin: (
    teamId: string,
    message?: string,
  ) => Promise<TeamActionOutcome<string>>;
}) {
  const router = useRouter();
  const [teamId, setTeamId] = useState(targets[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [requested, setRequested] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = targets.find((target) => target.id === teamId) ?? targets[0];
  if (!selected) return null;

  if (requested) {
    return (
      // `role="status"` rather than `<Callout alert>`: this is the polite half
      // of the pair. The request succeeded and nothing is waiting on the
      // reader, so it should be announced at the next pause rather than cut
      // across whatever the screen reader is already saying.
      <p
        role="status"
        className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"
      >
        Your request is with {selected.name}&rsquo;s lead. They get an email,
        and you will get one back when they answer — nothing is reserved for you
        in the meantime, so it is fine to ask a second team as well.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <h2 className="font-semibold text-white">Join a team</h2>

      {targets.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-white">Which team</span>
          <select
            value={selected.id}
            onChange={(event) => {
              setTeamId(event.target.value);
              setProblem(null);
            }}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-mauve-400">
          Joining{" "}
          <span className="font-semibold text-white">{selected.name}</span>.
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setProblem(null);
          startTransition(async () => {
            const result = await joinTeam(selected.id, code);
            if (!result.ok) {
              setProblem(result.code);
              return;
            }
            // The page decides what somebody on a team sees; re-rendering it
            // is the whole confirmation. A local "joined!" would leave the
            // roster on screen still missing them.
            setCode("");
            router.refresh();
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-white">Join code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            // Codes get read aloud in a room, so they arrive with stray spaces
            // and in whatever case the typist felt like. The action trims and
            // upper-cases before comparing; this only makes that visible.
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            required
            placeholder="ABC234"
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 font-mono text-sm tracking-widest text-white uppercase outline-none placeholder:text-mauve-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          />
        </label>

        <button
          type="submit"
          disabled={code.trim().length === 0 || isPending}
          className="self-start rounded-sm border-2 border-white bg-white px-4 py-2 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
        >
          {isPending ? "Joining…" : "Join with code"}
        </button>
      </form>

      {selected.acceptingRequests ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setProblem(null);
            startTransition(async () => {
              const result = await requestToJoin(selected.id, message);
              if (result.ok) setRequested(true);
              else setProblem(result.code);
            });
          }}
          className="flex flex-col gap-3 border-t border-mauve-800 pt-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-white">
              No code? Ask the lead
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={2}
              maxLength={280}
              placeholder="Optional — what you are hoping to work on."
              className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
          >
            {isPending ? "Sending…" : "Ask to join"}
          </button>
        </form>
      ) : (
        <p className="border-t border-mauve-800 pt-4 text-sm text-mauve-400">
          {selected.name} is not taking join requests, so the code is the only
          way in. Ask somebody on the team for it.
        </p>
      )}

      {problem && <TeamProblem code={problem} />}
    </div>
  );
}
