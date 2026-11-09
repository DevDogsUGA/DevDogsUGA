"use client";

import { useState } from "react";
import {
  updateReflectionSettings,
  type ReflectionSettingsActionState,
} from "~/server/actions/reflectionSettings";
import { ConsoleCard } from "~/classic/ui/card";
import type { ReflectionSettingsValue } from "~/server/reflections/settings";
import {
  FieldError,
  SettingsFormProvider,
  useBlurredError,
  useSettingsField,
} from "~/classic/ui/settings-form";
import SettingsSaveBar from "~/classic/ui/settings-save-bar";

const noState: ReflectionSettingsActionState = { ok: false, message: "" };

/** Whole numbers inside the action's own bounds, or the sentence that says so. */
function check(value: string, min: number, max: number) {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max
    ? null
    : `Enter a number from ${min} to ${max}.`;
}

/**
 * Officer-only editor for the two knobs `reflectionSettings` exposes: how
 * many words an EL reflection needs to submit, and how many days after the
 * activity ends the submission window stays open. Both are read fresh from
 * the DB by `/dashboard/attendance` on every load (see `reflections/load.ts`),
 * so this form has no client cache of its own to invalidate beyond the
 * `revalidatePath` calls `updateReflectionSettings` already makes.
 *
 * Same save model as Settings: nothing is written until the bar says Save, and
 * Discard returns both fields to the saved values.
 */
export default function ReflectionSettingsCard({
  settings,
}: {
  settings: ReflectionSettingsValue;
}) {
  return (
    <SettingsFormProvider>
      <ReflectionFields settings={settings} />
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

function ReflectionFields({ settings }: { settings: ReflectionSettingsValue }) {
  const [saved, setSaved] = useState({
    words: String(settings.minimumWordCount),
    days: String(settings.submissionWindowDays),
  });
  const [words, setWords] = useState(saved.words);
  const [days, setDays] = useState(saved.days);

  const wordsError = check(words, 100, 1000);
  const daysError = check(days, 7, 90);

  const { isSaving, serverError } = useSettingsField({
    id: "reflectionSettings",
    label: "Reflection settings",
    draft: [words, days],
    isDirty: words !== saved.words || days !== saved.days,
    error: wordsError ?? daysError,
    reset: () => {
      setWords(saved.words);
      setDays(saved.days);
    },
    save: () => persist(words, days),
  });

  const shownWords = useBlurredError(wordsError);
  const shownDays = useBlurredError(daysError);

  async function persist(nextWords: string, nextDays: string) {
    if (nextWords === saved.words && nextDays === saved.days) return;
    const data = new FormData();
    data.set("minimumWordCount", nextWords);
    data.set("submissionWindowDays", nextDays);
    const outcome = await updateReflectionSettings(noState, data);
    if (outcome.ok) setSaved({ words: nextWords, days: nextDays });
    return outcome;
  }

  return (
    <ConsoleCard.Root id="reflection-settings">
      <ConsoleCard.Header
        title="Reflection settings"
        description="Governs every EL reflection member-wide: how many words a submission needs, and how many days after a meeting ends members may still submit one."
      />
      <ConsoleCard.Content>
        <div className="flex flex-col gap-4 py-6">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-white/70">
              Minimum word count
              <input
                id="minimumWordCount"
                name="minimumWordCount"
                type="number"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                onBlur={shownWords.onBlur}
                disabled={isSaving}
                aria-invalid={shownWords.error ? true : undefined}
                min={100}
                max={1000}
                step={1}
                required
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
              />
              {shownWords.error && (
                <span className="text-xs text-rose-400">
                  {shownWords.error}
                </span>
              )}
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-white/70">
              Submission window (days)
              <input
                id="submissionWindowDays"
                name="submissionWindowDays"
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                onBlur={shownDays.onBlur}
                disabled={isSaving}
                aria-invalid={shownDays.error ? true : undefined}
                min={7}
                max={90}
                step={1}
                required
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-white/40"
              />
              {shownDays.error && (
                <span className="text-xs text-rose-400">{shownDays.error}</span>
              )}
            </label>
          </div>
          <FieldError error={serverError} />
        </div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
