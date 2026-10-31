"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import { Button } from "~/ui/button";
import ProgressBar from "~/ui/progress-bar";
import "~/components/Docs/docs.css";
import DocsHandoff from "~/components/DocsVscode/DocsHandoff";
import { setStepDone, stepKey, useDoneSteps } from "./store";

interface Props {
  project: string;
  /** The course's name: its folder's. */
  course: string;
  /** Every step, project-relative, in reading order. */
  steps: {
    path: string;
    title: string;
    checkpoint?: string;
  }[];
  /** This page's position in `steps`, from 0. */
  index: number;
  /** `/docs`, or the preview's prefix, so the links stay where the reader is. */
  base?: string;
}

/**
 * Under every page of a course: how far through it the reader is, a
 * done-marker for this step, and the steps either side. Following "Next"
 * marks this step done, so the button is only needed to undo a mark or to
 * finish the last step.
 */
export default function StepPager({
  project,
  course,
  steps,
  index,
  base = DOCS_BASE,
}: Props) {
  const doneSteps = useDoneSteps();
  const current = steps[index]!;
  const previous = steps[index - 1];
  const next = steps[index + 1];
  const key = stepKey(project, current.path);
  const done = doneSteps.has(key);
  const finished = steps.filter((step) =>
    doneSteps.has(stepKey(project, step.path)),
  ).length;

  return (
    <>
      <DocsHandoff project={project} steps={steps} />
      <nav aria-label={`${course} steps`} className="docs-pager">
        <div className="docs-pager-prog">
          <span>
            Step{" "}
            <b>
              {index + 1} of {steps.length}
            </b>{" "}
            · {finished} of {steps.length} done · {course}
          </span>
          <ProgressBar
            value={finished}
            max={steps.length}
            kind="workshop"
            label={`${course} progress`}
          />
        </div>

        <div className="docs-pager-act">
          <Button
            type="button"
            variant="outline"
            aria-pressed={done}
            className={done ? "isdone" : undefined}
            onClick={() => setStepDone(key, !done)}
          >
            {done && <CheckIcon weight="bold" />}
            {done ? "Done" : "Mark as done"}
          </Button>
          <span>Saves your place in this course.</span>
        </div>

        <div className="docs-pager-pn">
          {previous ? (
            <Link
              href={docsHref(project, previous.path.split("/"), base)}
              className="card quiet"
            >
              <div className="docs-pager-dir">
                <ArrowLeftIcon weight="bold" /> Previous
              </div>
              <div className="docs-pager-t">{previous.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={docsHref(project, next.path.split("/"), base)}
              onClick={() => setStepDone(key, true)}
              className="card quiet docs-pager-nx"
            >
              <div className="docs-pager-dir">
                Next <ArrowRightIcon weight="bold" />
              </div>
              <div className="docs-pager-t">{next.title}</div>
            </Link>
          )}
        </div>

        {finished === steps.length && (
          <p className="docs-finished">You&apos;ve finished {course}.</p>
        )}
      </nav>
    </>
  );
}
