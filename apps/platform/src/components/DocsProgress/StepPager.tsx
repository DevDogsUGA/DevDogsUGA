"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import { cn } from "~/lib/cn";
import DocsScheduled from "~/components/DocsScheduled";
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
    publishAt?: string;
    checkpoint?: string;
  }[];
  /** This page's position in `steps`, from 0. */
  index: number;
  /** `/docs`, or the preview's prefix, so the links stay where the reader is. */
  base?: string;
}

const NAV_LINK =
  "flex min-w-0 flex-col gap-0.5 rounded-md border border-mauve-800 px-4 py-3 transition-colors hover:border-mauve-600 hover:bg-mauve-900";

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
      <nav
        aria-label={`${course} steps`}
        className="mx-auto mt-16 flex max-w-3xl flex-col gap-4 border-t border-mauve-800 pt-6"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {previous ? (
            <Link
              href={docsHref(project, previous.path.split("/"), base)}
              className={NAV_LINK}
            >
              <span className="flex items-center gap-1.5 text-xs text-mauve-400">
                <ArrowLeftIcon className="size-3" /> Previous
              </span>
              <span className="truncate text-sm font-medium text-white">
                {previous.title}
              </span>
              {previous.publishAt && <DocsScheduled at={previous.publishAt} />}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={docsHref(project, next.path.split("/"), base)}
              onClick={() => setStepDone(key, true)}
              className={cn(NAV_LINK, "sm:items-end sm:text-right")}
            >
              <span className="flex items-center gap-1.5 text-xs text-mauve-400">
                Next <ArrowRightIcon className="size-3" />
              </span>
              <span className="truncate text-sm font-medium text-white">
                {next.title}
              </span>
              {next.publishAt && <DocsScheduled at={next.publishAt} />}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm text-mauve-400">
              Step {index + 1} of {steps.length} · {course}
            </p>
            <div
              role="progressbar"
              aria-label={`${course} progress`}
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={finished}
              className="h-1 w-48 overflow-hidden rounded-full bg-mauve-800"
            >
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width]"
                style={{ width: `${(finished / steps.length) * 100}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            aria-pressed={done}
            onClick={() => setStepDone(key, !done)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              done
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                : "border-mauve-700 text-mauve-200 hover:bg-mauve-800 hover:text-white",
            )}
          >
            {done ? (
              <CheckCircleIcon weight="fill" className="size-4" />
            ) : (
              <CircleIcon className="size-4" />
            )}
            {done ? "Done" : "Mark as done"}
          </button>
        </div>

        {finished === steps.length && (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            You&apos;ve finished {course}.
          </p>
        )}
      </nav>
    </>
  );
}
