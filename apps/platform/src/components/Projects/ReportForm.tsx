"use client";

import "./projects.css";

import { useActionState, useId, useState } from "react";
import {
  submitReportAction,
  type ProjectActionState,
} from "~/server/actions/projects";
import { REPORT_MINIMUM_WORDS } from "~/server/projects/policy";
import { reflectionWordCount } from "~/server/reflections/policy";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

const initialState: ProjectActionState = { ok: false, message: "" };

export interface ReportFormPullRequest {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  /** Formatted for display. */
  merged: string;
  selected: boolean;
}

export interface ReportFormValues {
  reportId: string | null;
  startDate: string;
  endDate: string;
  hours: string;
  content: string;
}

/**
 * A project report: the date range, the hours worked, merged pull requests as
 * evidence, and a reflection of at least 100 words. Resubmitting a returned
 * report passes its `reportId`.
 */
export default function ReportForm({
  projectId,
  projectName,
  values,
  pullRequests,
  today,
}: {
  projectId: string;
  projectName: string;
  values: ReportFormValues;
  pullRequests: ReportFormPullRequest[];
  /** The Eastern day, to cap the date pickers. */
  today: string;
}) {
  const [state, action, pending] = useActionState(
    submitReportAction,
    initialState,
  );
  const [words, setWords] = useState(reflectionWordCount(values.content));
  const [cited, setCited] = useState(
    pullRequests.filter((pr) => pr.selected).length,
  );
  const countId = useId();
  const short = Math.max(0, REPORT_MINIMUM_WORDS - words);
  return (
    <form action={action} className="prj-form">
      <input type="hidden" name="projectId" value={projectId} />
      {values.reportId && (
        <input type="hidden" name="reportId" value={values.reportId} />
      )}
      <div className="prj-row">
        <Field label="From" htmlFor="prj-start" required>
          <Input
            id="prj-start"
            type="date"
            name="startDate"
            defaultValue={values.startDate}
            max={today}
            required
          />
        </Field>
        <Field label="Through" htmlFor="prj-end" required>
          <Input
            id="prj-end"
            type="date"
            name="endDate"
            defaultValue={values.endDate}
            max={today}
            required
          />
        </Field>
        <Field
          label="Hours worked"
          htmlFor="prj-hours"
          description="Actual hours, in quarter hours. Leave out workshop time already credited."
          required
        >
          <Input
            id="prj-hours"
            type="number"
            name="hours"
            defaultValue={values.hours}
            min={0.25}
            max={200}
            step={0.25}
            inputMode="decimal"
            required
          />
        </Field>
      </div>

      <fieldset className="prj-stack prj-fieldset">
        <legend className="label">Merged pull requests</legend>
        {pullRequests.length === 0 ? (
          <p className="prj-meta">
            No unclaimed merged pull requests of yours in {projectName}. A
            report needs at least one as evidence, and a pull request can back
            only one report.
          </p>
        ) : (
          <ul className="prj-prs">
            {pullRequests.map((pr) => (
              <li key={pr.id} className="prj-pr">
                <Checkbox
                  name="contributionId"
                  value={pr.id}
                  defaultChecked={pr.selected}
                  onChange={(event) => {
                    const on = event.currentTarget.checked;
                    setCited((n) => n + (on ? 1 : -1));
                  }}
                  label={
                    <span>
                      {pr.repo}#{pr.number} {pr.title}{" "}
                      <span className="prj-meta">merged {pr.merged}</span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <p className="prj-meta">
          Tick at least one from this range. A pull request that is out of range, or
          already in another report, is refused.
        </p>
      </fieldset>

      <Field
        label="What you did and learned"
        htmlFor="prj-content"
        description="Your own account of the work: what you built, what was hard, what you learned."
        required
      >
        <Textarea
          id="prj-content"
          name="content"
          defaultValue={values.content}
          onChange={(event) =>
            setWords(reflectionWordCount(event.target.value))
          }
          required
          maxLength={20_000}
          rows={9}
          aria-describedby={countId}
        />
      </Field>
      <p className="prj-count" id={countId}>
        {short > 0 ? (
          <b className={cn("prj-count-n", "is-short")}>
            {words} of {REPORT_MINIMUM_WORDS} words
          </b>
        ) : (
          <b>{words} words</b>
        )}
        {short > 0 ? ` · ${short} to go` : ""}
      </p>
      <div>
        <Button type="submit" size="sm" disabled={pending || short > 0 || cited === 0}>
          {values.reportId ? "Resubmit report" : "Submit report"}
        </Button>
      </div>
      {state.message && (
        <p className={cn("prj-status", state.ok ? "ok" : "bad")} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
