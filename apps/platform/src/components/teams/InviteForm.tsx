"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { InviteeSuggestion } from "~/server/actions/teams";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { ConsoleCard } from "~/ui/card";

/** Wait for a pause in typing before asking the server. */
const SEARCH_DEBOUNCE_MS = 250;
/** Matches the server's floor; shorter queries are never sent. */
const MIN_QUERY_LENGTH = 2;

/**
 * How a lead gets somebody specific onto the team.
 *
 * One field with two ways in. Typing a name or handle suggests matching
 * members from `searchInvitees` -- only verified members with a public
 * profile, the same people the Community directory lists -- and choosing one
 * fills the field with `@handle`. Typing an exact email or GitHub username
 * works for everybody else, public or not, since there is deliberately no way
 * to search for a member who has not opted in. Suggestions never carry an
 * account id; the invite resolves the `@handle` again on the server (see
 * `resolveInvitee` in `server/actions/teams.ts`).
 *
 * The suggestion list is an ARIA combobox: focus stays in the input, arrow
 * keys move `aria-activedescendant`, Enter picks, Escape closes. Searching is
 * debounced in the change handler and a response that arrives after a newer
 * keystroke is dropped.
 *
 * A miss on submit is not a bug to report; it means the person has not signed
 * up on the platform yet, or signed up but never linked GitHub, or is not
 * public and the identifier was not their exact email, and the failure message
 * says so rather than reading like an error.
 *
 * A sent invite is not confirmation the right person got it -- it is
 * confirmation a request row was created for whichever account matched.
 * `/teams/requests` is where the invitee actually answers, and the email
 * this fires (`teamInvite`, best-effort -- see `notifyInvitee`) is the other
 * way they hear about it.
 *
 * Without `searchInvitees` (public profiles switched off, see
 * `server/features.ts`) the field takes an exact email or GitHub username
 * only and never suggests anyone.
 */
export default function InviteForm({
  teamId,
  inviteToTeam,
  searchInvitees,
}: {
  teamId: string;
  inviteToTeam: (
    teamId: string,
    identifier: string,
  ) => Promise<TeamActionOutcome<string>>;
  searchInvitees?: (
    teamId: string,
    query: string,
  ) => Promise<TeamActionOutcome<InviteeSuggestion[]>>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [suggestions, setSuggestions] = useState<InviteeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // Debounce timer and a request counter: a reply is only applied if no newer
  // keystroke (or pick, or close) has happened since it was requested.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function cancelSearch() {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestRef.current += 1;
  }

  function closeList() {
    cancelSearch();
    setOpen(false);
    setActiveIndex(-1);
  }

  function scheduleSearch(value: string) {
    cancelSearch();
    const query = value.trim().replace(/^@/, "");
    // An `@` in the middle means an email is being typed, which suggestions
    // cannot help with.
    if (
      !searchInvitees ||
      query.length < MIN_QUERY_LENGTH ||
      query.includes("@")
    ) {
      setOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const request = requestRef.current;
    timerRef.current = setTimeout(() => {
      void searchInvitees(teamId, query).then((result) => {
        if (request !== requestRef.current) return;
        const found = result.ok ? result.value : [];
        setSuggestions(found);
        setActiveIndex(-1);
        setOpen(found.length > 0);
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  function pick(suggestion: InviteeSuggestion) {
    closeList();
    setIdentifier(`@${suggestion.handle}`);
    setSent(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (suggestions.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) => (index + 1) % suggestions.length);
        break;
      case "ArrowUp":
        if (suggestions.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActiveIndex((index) =>
          index <= 0 ? suggestions.length - 1 : index - 1,
        );
        break;
      case "Enter": {
        // Only claim Enter while an option is highlighted; otherwise it
        // submits the form as usual.
        const active = open ? suggestions[activeIndex] : undefined;
        if (active) {
          event.preventDefault();
          pick(active);
        }
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          closeList();
        }
        break;
    }
  }

  return (
    <ConsoleCard.Root id="invite">
      <ConsoleCard.Header
        title="Invite Somebody"
        description={
          <>
            {searchInvitees
              ? "Search members by name or handle, or enter anyone's exact email or GitHub username."
              : "Their exact email or GitHub username -- there is no directory to search."}{" "}
            They will see it on{" "}
            <span className="font-semibold text-white">/teams/requests</span>,
            and get an email too.
          </>
        }
      />
      <ConsoleCard.Content>
        <div className="flex flex-col gap-4">
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
            <div className="relative flex flex-1 flex-col gap-1 text-sm">
              <label
                htmlFor={`${listboxId}-input`}
                className="font-semibold text-white"
              >
                {searchInvitees
                  ? "Name, handle, email or GitHub username"
                  : "Email or GitHub username"}
              </label>
              <input
                id={`${listboxId}-input`}
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  open && activeIndex >= 0 ? optionId(activeIndex) : undefined
                }
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setSent(null);
                  scheduleSearch(event.target.value);
                }}
                onKeyDown={onKeyDown}
                onBlur={closeList}
                autoComplete="off"
                spellCheck={false}
                required
                placeholder={
                  searchInvitees
                    ? "Ada Lovelace, ada@uga.edu or adalovelace"
                    : "ada@uga.edu or adalovelace"
                }
                className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
              />
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Matching members"
                hidden={!open}
                className="absolute top-full right-0 left-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-sm border border-mauve-600 bg-mauve-900 py-1 shadow-lg"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.handle}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Keep focus in the input; the click still lands.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(suggestion)}
                    onMouseMove={() => setActiveIndex(index)}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-white aria-selected:bg-mauve-700"
                  >
                    <Avatar size="sm">
                      {suggestion.avatarUrl && (
                        <AvatarImage src={suggestion.avatarUrl} alt="" />
                      )}
                      <AvatarFallback>
                        {suggestion.label.replace(/^@/, "").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{suggestion.label}</span>
                      {suggestion.label !== `@${suggestion.handle}` && (
                        <span className="truncate text-xs text-mauve-300">
                          @{suggestion.handle}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <span role="status" className="sr-only">
                {open
                  ? `${suggestions.length} ${suggestions.length === 1 ? "member matches" : "members match"}`
                  : ""}
              </span>
            </div>
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
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
