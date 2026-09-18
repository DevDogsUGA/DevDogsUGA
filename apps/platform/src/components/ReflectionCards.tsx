"use client";

import { useActionState, useState } from "react";
import {
  saveReflection,
  type ReflectionActionState,
} from "~/server/actions/reflections";
import { formatEventDateTime } from "~/lib/eventTime";
import type { ReflectionActivity } from "~/server/reflections/load";

const initialState: ReflectionActionState = { ok: false, message: "" };

export default function ReflectionCards({
  activities,
  minimumWordCount,
}: {
  activities: ReflectionActivity[];
  minimumWordCount: number;
}) {
  if (activities.length === 0) return null;
  return (
    <section className="rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-6 shadow-lg shadow-black/30">
      <h2 className="text-lg font-semibold text-white">EL reflections</h2>
      <p className="mt-1 text-sm text-mauve-400">
        Eligible workshops and DevDogs competitions count as one club hour. Save
        a draft anytime during the submission window; submission requires at
        least {minimumWordCount} words.
      </p>
      <div className="mt-6 grid gap-5">
        {activities.map((activity) => (
          <ReflectionCard
            key={`${activity.activityType}:${activity.activityId}`}
            activity={activity}
            minimumWordCount={minimumWordCount}
          />
        ))}
      </div>
    </section>
  );
}

function ReflectionCard({
  activity,
  minimumWordCount,
}: {
  activity: ReflectionActivity;
  minimumWordCount: number;
}) {
  const [state, action, pending] = useActionState(saveReflection, initialState);
  const [wordCount, setWordCount] = useState(activity.wordCount);
  const submitted = activity.submittedAt !== null;
  return (
    <form
      action={action}
      className="rounded-lg border border-white/10 bg-white/5 p-4"
    >
      <input type="hidden" name="activityType" value={activity.activityType} />
      <input type="hidden" name="activityId" value={activity.activityId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-mauve-400 uppercase">
            {activity.activityType}
          </p>
          <h3 className="font-semibold text-white">{activity.label}</h3>
        </div>
        <span className="rounded-full bg-mauve-800 px-3 py-1 text-xs text-mauve-200">
          {submitted
            ? "Submitted"
            : activity.canEdit
              ? "Draft"
              : "Window closed"}
        </span>
      </div>
      <textarea
        name="content"
        defaultValue={activity.content}
        onChange={(event) => setWordCount(countWords(event.target.value))}
        disabled={!activity.canEdit}
        maxLength={12_000}
        rows={7}
        aria-label={`Reflection for ${activity.label}`}
        className="mt-4 w-full rounded-md border border-mauve-700 bg-mauve-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-70"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-mauve-400">
        <span>
          {wordCount} words · due {formatEventDateTime(activity.deadline)}
        </span>
        {activity.canEdit && (
          <div className="flex gap-2">
            <button
              name="intent"
              value="save"
              disabled={pending}
              className="rounded-sm border border-mauve-500 px-3 py-1.5 text-white disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              name="intent"
              value="submit"
              disabled={pending}
              title={`Requires ${minimumWordCount} words`}
              className="rounded-sm bg-cyan-400 px-3 py-1.5 font-medium text-black disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        )}
      </div>
      {state.message && (
        <p
          className={`mt-3 text-sm ${state.ok ? "text-cyan-300" : "text-rose-300"}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function countWords(content: string): number {
  const normalized = content.trim();
  return normalized === "" ? 0 : normalized.split(/\s+/u).length;
}
