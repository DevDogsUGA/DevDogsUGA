"use client";

import { useActionState } from "react";
import {
  updateReflectionSettings,
  type ReflectionSettingsActionState,
} from "~/server/actions/reflectionSettings";
import { ConsoleCard } from "~/ui/card";
import type { ReflectionSettingsValue } from "~/server/reflections/settings";

const initialState: ReflectionSettingsActionState = { ok: false, message: "" };

/**
 * Officer-only editor for the two knobs `reflectionSettings` exposes: how
 * many words an EL reflection needs to submit, and how many days after the
 * activity ends the submission window stays open. Both are read fresh from
 * the DB by `/attendance` on every load (see `reflections/load.ts`), so this
 * form has no client cache of its own to invalidate beyond the
 * `revalidatePath` calls `updateReflectionSettings` already makes.
 */
export default function ReflectionSettingsCard({
  settings,
}: {
  settings: ReflectionSettingsValue;
}) {
  const [state, action, pending] = useActionState(
    updateReflectionSettings,
    initialState,
  );

  return (
    <ConsoleCard.Root id="reflection-settings">
      <ConsoleCard.Header
        title="Reflection settings"
        description="Governs every EL reflection member-wide: how many words a submission needs, and how many days after a meeting or competition closes members may still submit one."
      />
      <ConsoleCard.Content>
        <form action={action} className="flex flex-col gap-4 py-6">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-white/70">
              Minimum word count
              <input
                name="minimumWordCount"
                type="number"
                defaultValue={settings.minimumWordCount}
                min={1}
                max={1000}
                step={1}
                required
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-white/70">
              Submission window (days)
              <input
                name="submissionWindowDays"
                type="number"
                defaultValue={settings.submissionWindowDays}
                min={1}
                max={90}
                step={1}
                required
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="self-start rounded-sm bg-cyan-400 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {state.message && (
              <p
                role="status"
                className={`text-sm ${state.ok ? "text-cyan-300" : "text-rose-300"}`}
              >
                {state.message}
              </p>
            )}
          </div>
        </form>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
