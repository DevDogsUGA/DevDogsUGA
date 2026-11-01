"use client";

import "./projects.css";

import { useId, useState } from "react";
import { cn } from "~/lib/cn";
import { fileReportAction } from "~/server/actions/projects";
import { REPORT_MINIMUM_WORDS } from "~/server/projects/policy";
import { reflectionWordCount } from "~/server/reflections/policy";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { TextLink } from "~/ui/text-link";
import { Textarea } from "~/ui/textarea";
import { CommandFeedback, useCommand } from "~/ui/use-command";

export interface ReportFormCommit {
  sha: string;
  title: string;
  /** The Eastern day it landed, compared with the date range. */
  day: string;
  /** Formatted for display, with its size. */
  detail: string;
  url: string;
  repo: string;
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
 * An EL report: the date range, the hours worked, commits as evidence and a
 * reflection of at least 100 words. The commit list is the member's own stored
 * commits in the project's repos, narrowed to the date range; a commit another
 * report cites is not offered. Resubmitting passes the report's id.
 */
export default function ReportForm({
  projectId,
  projectName,
  values,
  commits,
  today,
  projectHref,
}: {
  projectId: string;
  projectName: string;
  values: ReportFormValues;
  commits: ReportFormCommit[];
  /** The Eastern day, to cap the date pickers. */
  today: string;
  projectHref: string;
}) {
  const { run, pending, result } = useCommand(fileReportAction);
  const [start, setStart] = useState(values.startDate);
  const [end, setEnd] = useState(values.endDate);
  const [words, setWords] = useState(reflectionWordCount(values.content));
  const [chosen, setChosen] = useState(
    () => new Set(commits.filter((c) => c.selected).map((c) => c.sha)),
  );
  const countId = useId();
  const short = Math.max(0, REPORT_MINIMUM_WORDS - words);
  const inRange = commits.filter(
    (c) => start !== "" && end !== "" && c.day >= start && c.day <= end,
  );
  const cited = inRange.filter((c) => chosen.has(c.sha));
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const filed = result?.ok === true;

  return (
    <form action={run} className="prj-form">
      <input type="hidden" name="projectId" value={projectId} />
      {values.reportId && (
        <input type="hidden" name="reportId" value={values.reportId} />
      )}
      <div className="prj-row">
        <Field
          label="From"
          htmlFor="prj-start"
          required
          error={errors.startDate}
        >
          <Input
            id="prj-start"
            type="date"
            name="startDate"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            max={today}
            required
          />
        </Field>
        <Field
          label="Through"
          htmlFor="prj-end"
          required
          error={errors.endDate}
        >
          <Input
            id="prj-end"
            type="date"
            name="endDate"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            max={today}
            required
          />
        </Field>
        <Field
          label="Hours worked"
          htmlFor="prj-hours"
          description="Actual hours, in quarter hours. Leave out workshop time already credited."
          required
          error={errors.hours}
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
        <legend className="label">Commits</legend>
        {commits.length === 0 ? (
          <p className="prj-meta">
            No unclaimed commits of yours in {projectName}. A report needs at
            least one as evidence, and a commit can back only one report.
            Refresh the project&rsquo;s commits if yours are missing.
          </p>
        ) : start === "" || end === "" ? (
          <p className="prj-meta">Choose a date range to see your commits.</p>
        ) : inRange.length === 0 ? (
          <p className="prj-meta">None of your commits landed in that range.</p>
        ) : (
          <ul className="prj-prs">
            {inRange.map((commit) => (
              <li key={commit.sha} className="prj-pr">
                <Checkbox
                  name="sha"
                  value={commit.sha}
                  checked={chosen.has(commit.sha)}
                  onChange={(event) => {
                    const on = event.currentTarget.checked;
                    setChosen((previous) => {
                      const next = new Set(previous);
                      if (on) next.add(commit.sha);
                      else next.delete(commit.sha);
                      return next;
                    });
                  }}
                  label={
                    <span>
                      {commit.title}{" "}
                      <span className="prj-meta">
                        {commit.repo} · {commit.detail}
                      </span>
                    </span>
                  }
                />
                <TextLink href={commit.url} target="_blank" rel="noreferrer">
                  {commit.sha.slice(0, 7)}
                </TextLink>
              </li>
            ))}
          </ul>
        )}
        {errors.shas && (
          <p className="prj-status bad" role="alert">
            {errors.shas}
          </p>
        )}
        <p className="prj-meta">
          Tick at least one commit from this range. A commit already in another
          report is not offered.
        </p>
      </fieldset>

      <Field
        label="What you did and learned"
        htmlFor="prj-content"
        description="Your own account of the work: what you built, what was hard, what you learned."
        required
        error={errors.content}
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
        <Button
          type="submit"
          size="sm"
          disabled={pending || short > 0 || cited.length === 0}
        >
          {values.reportId ? "Resubmit report" : "Submit report"}
        </Button>
      </div>
      {Object.keys(errors).length === 0 && <CommandFeedback result={result} />}
      {filed && (
        <Callout tone="success" title="Report submitted">
          It is waiting for review.{" "}
          <TextLink href={projectHref}>Back to the project</TextLink>
        </Callout>
      )}
    </form>
  );
}
