"use client";

import "./participation/passport.css";

import { useActionState, useId, useState } from "react";
import {
  saveReflection,
  type ReflectionActionState,
} from "~/server/actions/reflections";
import { formatEventDateTime } from "~/lib/eventTime";
import type { ReflectionActivity } from "~/server/reflections/load";
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Textarea } from "~/ui/textarea";

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
    <section className="att-sect" aria-labelledby="reflections">
      <h2 id="reflections">EL reflections</h2>
      <p className="muted small">
        Eligible workshops count as one club hour. Save a draft anytime during
        the submission window; submission requires at least {minimumWordCount}{" "}
        words.
      </p>
      <div className="att-refl-list">
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
  const countId = useId();
  const submitted = activity.submittedAt !== null;
  const short = Math.max(0, minimumWordCount - wordCount);
  return (
    <form action={action} className="card flat att-refl">
      <input type="hidden" name="activityType" value={activity.activityType} />
      <input type="hidden" name="activityId" value={activity.activityId} />
      <div className="att-hd">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {activity.activityType}
          </div>
          <b>{activity.label}</b>
        </div>
        <Badge variant={submitted ? "success" : "default"}>
          {submitted
            ? "Submitted"
            : activity.canEdit
              ? "Draft"
              : "Window closed"}
        </Badge>
      </div>
      {activity.workshops.length === 1 ? (
        <input
          type="hidden"
          name="workshopDefinitionId"
          value={activity.workshops[0]!.id}
        />
      ) : (
        <Field
          label="Which workshop did you attend?"
          description="Pick the one you went to. It earns you that workshop's badge once you submit."
          htmlFor={`${countId}-workshop`}
        >
          <span className="input select">
            <select
              id={`${countId}-workshop`}
              name="workshopDefinitionId"
              defaultValue={activity.workshopDefinitionId ?? ""}
              disabled={!activity.canEdit}
            >
              <option value="" disabled>
                Choose a workshop
              </option>
              {activity.workshops.map((workshop) => (
                <option key={workshop.id} value={workshop.id}>
                  {workshop.title}
                </option>
              ))}
            </select>
          </span>
        </Field>
      )}
      <Field label="Your reflection" htmlFor={`${countId}-text`}>
        <Textarea
          id={`${countId}-text`}
          name="content"
          defaultValue={activity.content}
          onChange={(event) => setWordCount(countWords(event.target.value))}
          disabled={!activity.canEdit}
          maxLength={12_000}
          rows={7}
          aria-label={`Reflection for ${activity.label}`}
        />
      </Field>
      <p className="att-ft" id={countId}>
        {short > 0 ? (
          <b style={{ color: "var(--warn)" }}>
            {wordCount} of {minimumWordCount} words
          </b>
        ) : (
          <b>
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </b>
        )}
        {short > 0 && activity.canEdit
          ? ` · ${short} to go before you can submit`
          : ""}{" "}
        · due {formatEventDateTime(activity.deadline)}
      </p>
      {activity.canEdit && (
        <div className="att-acts">
          <Button
            type="submit"
            name="intent"
            value="save"
            variant="secondary"
            size="sm"
            disabled={pending}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            name="intent"
            value="submit"
            size="sm"
            disabled={pending || short > 0}
            aria-describedby={countId}
          >
            Submit
          </Button>
        </div>
      )}
      {state.message && (
        <p className={`att-stat ${state.ok ? "ok" : "bad"}`} role="status">
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
