"use client";

import { useState, useTransition } from "react";
import FormButton from "~/components/FormButton";
import {
  describeHandleOutcome,
  handleKindLabel,
  handleUrlPath,
  revealsConnectedUsername,
  type HandleOutcomeMessage,
} from "~/lib/handleOptions";
import { getMyHandleChoices } from "~/server/actions/publicProfile";
import setHandle from "~/server/actions/profileHandle";
import type { HandleChoices } from "~/server/loaders/publicProfiles";
import Callout from "~/ui/callout";

interface Props {
  /** What the server read when the picker rendered. Later reads replace it. */
  choices: HandleChoices;
  /** Called with the stored handle after a successful save. */
  onSaved?: (handle: string) => void;
}

/**
 * Lets a member choose the handle their public profile lives at. Shared by
 * the verification dialog and /account.
 *
 * Availability is a snapshot: another member can take an option after this
 * list was read. `setHandle` answers that race with `taken`, which this shows
 * inline and follows with a fresh read, so the member sees the real state
 * rather than clicking the same dead option again.
 */
export default function HandlePicker({ choices: initial, onSaved }: Props) {
  const [choices, setChoices] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.current);
  const [result, setResult] = useState<HandleOutcomeMessage | null>(null);
  const [pending, startTransition] = useTransition();

  const unchanged = selected === null || selected === choices.current;
  const picked = choices.options.find((o) => o.handle === selected);

  function save() {
    if (selected === null) return;
    startTransition(async () => {
      let outcome: HandleOutcomeMessage;
      try {
        const response = await setHandle(selected);
        outcome = describeHandleOutcome(response);
        if (response.status === "set") {
          setChoices((current) => ({ ...current, current: response.handle }));
          onSaved?.(response.handle);
        }
      } catch {
        outcome = {
          tone: "critical",
          message: "Something went wrong saving your handle. Try again.",
          refresh: false,
        };
      }
      setResult(outcome);
      if (outcome.refresh) {
        try {
          const fresh = await getMyHandleChoices();
          setChoices(fresh);
          setSelected(fresh.current);
        } catch {
          // Keep the old list; the message above already says what happened.
        }
      }
    });
  }

  if (choices.options.length === 0) {
    return (
      <p className="text-sm text-mauve-400">
        There are no handles to choose from yet. Add a preferred name or link a
        GitHub or Discord account, then come back.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-md text-xs text-mauve-300">
        Your handle is public: anyone can see it in your profile address.
        Choosing your GitHub or Discord username makes that username public even
        if the account is hidden on your profile.
      </p>

      <fieldset className="flex max-w-md flex-col gap-1.5" disabled={pending}>
        <legend className="sr-only">Handle</legend>
        {choices.options.map((option) => {
          const taken = !option.available;
          const isSelected = selected === option.handle;
          return (
            <label
              key={option.handle}
              className={`flex items-start gap-3 rounded-sm border px-3 py-2 text-sm ${
                taken
                  ? "cursor-not-allowed border-mauve-800 text-mauve-500"
                  : isSelected
                    ? "cursor-pointer border-cyan-400 bg-cyan-400/10 text-white"
                    : "cursor-pointer border-mauve-700 text-white hover:border-mauve-500"
              }`}
            >
              <input
                type="radio"
                name="handle"
                value={option.handle}
                checked={isSelected}
                disabled={taken}
                onChange={() => {
                  setSelected(option.handle);
                  setResult(null);
                }}
                className="mt-1 accent-cyan-400"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {handleKindLabel(option.kind)}
                  </span>
                  {taken && (
                    <span className="text-xs text-rose-300">taken</span>
                  )}
                </span>
                <span className="text-xs break-all text-mauve-400">
                  {handleUrlPath(option)}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {picked && revealsConnectedUsername(picked.kind) && (
        <p className="max-w-md text-xs text-amber-200">
          This publishes your {handleKindLabel(picked.kind)} to everyone who
          sees your profile address.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <FormButton
          type="button"
          theme="cyan"
          className="w-fit text-sm"
          disabled={unchanged || pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save handle"}
        </FormButton>
      </div>

      {result && (
        <Callout tone={result.tone} alert>
          {result.message}
        </Callout>
      )}
    </div>
  );
}
