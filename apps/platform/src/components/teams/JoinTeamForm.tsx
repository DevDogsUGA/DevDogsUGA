"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import TeamCombobox from "~/components/teams/TeamCombobox";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";
import { ConsoleCard } from "~/ui/card";

export interface JoinTarget {
  id: string;
  name: string;
  /** `teams.acceptingRequests`: a team may close itself to strangers. */
  acceptingRequests: boolean;
}

const INPUT_CLS =
  "rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

/**
 * The two ways onto a team you are not on, as two separate halves.
 *
 * They share a card because they are one decision, "get me onto a team", and
 * each is the other's fallback: the code is instant and needs somebody to
 * have given it to you, the request is not instant and needs nobody. But they
 * do not share inputs. The code names its own team, so it stands alone; only
 * the request has to say which team it is asking.
 */
export default function JoinTeamForm({
  targets,
  defaultTeamId,
  joinTeam,
  requestToJoin,
}: {
  /** Every team a request could go to. Closed ones are listed, not pickable. */
  targets: JoinTarget[];
  /** Preselected for the request, e.g. the team whose page this is on. */
  defaultTeamId?: string;
  /** Returns the joined team's slug on success. */
  joinTeam: (joinCode: string) => Promise<TeamActionOutcome<string>>;
  /**
   * Returns the request id on success. The message is optional at the action:
   * an all-whitespace note is normalized to absent there rather than here, so
   * this passes whatever was typed.
   */
  requestToJoin: (
    teamId: string,
    message?: string,
  ) => Promise<TeamActionOutcome<string>>;
}) {
  return (
    <ConsoleCard.Root id="join">
      <ConsoleCard.Header title="Join a Team" />
      <ConsoleCard.Content>
        <JoinWithCode joinTeam={joinTeam} />
        <AskToJoin
          targets={targets}
          defaultTeamId={defaultTeamId}
          requestToJoin={requestToJoin}
        />
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

function JoinWithCode({
  joinTeam,
}: {
  joinTeam: (joinCode: string) => Promise<TeamActionOutcome<string>>;
}) {
  const router = useRouter();
  const inputId = useId();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setProblem(null);
        startTransition(async () => {
          const result = await joinTeam(code);
          if (!result.ok) {
            setProblem(result.code);
            return;
          }
          // The team's page is the whole confirmation: it renders the roster
          // with them on it. Already on that page, a refresh does the same.
          setCode("");
          const href = `/teams/${result.value}`;
          if (window.location.pathname === href) router.refresh();
          else router.push(href);
        });
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <label htmlFor={inputId} className="font-semibold text-white">
          Have a join code?
        </label>
        <p className="text-sm text-mauve-400">
          It takes you straight onto its team. Ask anybody on the team for it.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
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
          className={`${INPUT_CLS} w-40 font-mono tracking-widest uppercase`}
        />
        <button
          type="submit"
          disabled={code.trim().length === 0 || isPending}
          className="rounded-sm border-2 border-white bg-white px-4 py-2 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
        >
          {isPending ? "Joining…" : "Join"}
        </button>
      </div>
      {problem && <TeamProblem code={problem} />}
    </form>
  );
}

function AskToJoin({
  targets,
  defaultTeamId,
  requestToJoin,
}: {
  targets: JoinTarget[];
  defaultTeamId?: string;
  requestToJoin: (
    teamId: string,
    message?: string,
  ) => Promise<TeamActionOutcome<string>>;
}) {
  const teamFieldId = useId();
  const messageId = useId();
  const [teamId, setTeamId] = useState<string | null>(() => {
    const preset = targets.find((target) => target.id === defaultTeamId);
    return preset?.acceptingRequests ? preset.id : null;
  });
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [requestedTo, setRequestedTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (requestedTo !== null) {
    return (
      // `role="status"` rather than `<Callout alert>`: this is the polite half
      // of the pair. The request succeeded and nothing is waiting on the
      // reader, so it should be announced at the next pause rather than cut
      // across whatever the screen reader is already saying.
      <p
        role="status"
        className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"
      >
        Your request is with {requestedTo}&rsquo;s lead, who answers it from
        their team requests page. Nothing is reserved for you in the meantime,
        so it is fine to ask a second team as well.
      </p>
    );
  }

  const selected = targets.find((target) => target.id === teamId);
  // A closed team preselected by its own page says why, here, rather than
  // leaving an empty picker with no explanation.
  const closedDefault = targets.find(
    (target) => target.id === defaultTeamId && !target.acceptingRequests,
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) return;
        setProblem(null);
        startTransition(async () => {
          const result = await requestToJoin(selected.id, message);
          if (result.ok) setRequestedTo(selected.name);
          else setProblem(result.code);
        });
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <p className="font-semibold text-white">No code? Ask to join</p>
        <p className="text-sm text-mauve-400">
          Pick the team, and its lead approves or declines.
        </p>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={teamFieldId} className="font-semibold text-white">
          Team
        </label>
        <TeamCombobox
          id={teamFieldId}
          value={teamId}
          onChange={(next) => {
            setTeamId(next);
            setProblem(null);
          }}
          options={targets.map((target) => ({
            id: target.id,
            name: target.name,
            disabledReason: target.acceptingRequests
              ? undefined
              : "Not taking requests",
          }))}
        />
        {closedDefault && teamId === null && (
          <p className="text-mauve-400">
            {closedDefault.name} is not taking join requests, so its code is the
            only way in.
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm" htmlFor={messageId}>
        <span className="font-semibold text-white">
          Message <span className="font-normal text-mauve-400">(optional)</span>
        </span>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          maxLength={280}
          placeholder="What you are hoping to work on."
          className={INPUT_CLS}
        />
      </label>

      <button
        type="submit"
        disabled={!selected || isPending}
        className="self-start rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
      >
        {isPending ? "Sending…" : "Ask to join"}
      </button>

      {problem && <TeamProblem code={problem} />}
    </form>
  );
}
