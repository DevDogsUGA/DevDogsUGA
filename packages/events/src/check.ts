#!/usr/bin/env node
import { type z } from "zod";
import badgesFile from "./data/badges.json" with { type: "json" };
import meetingsFile from "./data/meetings.json" with { type: "json" };
import seriesFile from "./data/series.json" with { type: "json" };
import questionsFile from "./data/questions.json" with { type: "json" };
import venuesFile from "./data/venues.json" with { type: "json" };
import workshopsFile from "./data/workshops.json" with { type: "json" };
import { badgesConfigSchema, validateBadges } from "./badges.js";
import { ClubConfigError } from "./index.js";
import { questionsConfigSchema } from "./questions.js";
import { resolveMeetings } from "./resolve.js";
import { clubConfigSchema } from "./schema.js";
import { seriesConfigSchema } from "./series.js";
import {
  validateAuthored,
  validateCatalog,
  validateClubConfig,
} from "./validator.js";
import { venuesConfigSchema } from "./venues.js";
import { workshopsConfigSchema } from "./workshops.js";

/**
 * `pnpm --filter @devdogsuga/events check:events` -- the CI gate.
 *
 * Config is validated exactly once, here, before it ever reaches a deploy:
 * the runtime reconcile (`server/config/reconcile.ts`) trusts what it parses
 * and refuses to partially apply a bad file rather than re-validating field
 * by field, so THIS is the only place an author gets a readable error. Wired
 * into `.github/workflows/ci.yaml` as a merge-blocking step.
 *
 * Each file's shape is reported under its own name; then the two are
 * validated together, since meetings list questions by id.
 */
function shapeErrors(file: string, error: z.ZodError): void {
  process.stderr.write(`events: src/data/${file} does not match the schema:\n`);
  for (const issue of error.issues) {
    process.stderr.write(`  ${issue.path.join(".")}: ${issue.message}\n`);
  }
}

function main(): number {
  const meetings = clubConfigSchema.safeParse(meetingsFile);
  const series = seriesConfigSchema.safeParse(seriesFile);
  const questions = questionsConfigSchema.safeParse(questionsFile);
  const workshops = workshopsConfigSchema.safeParse(workshopsFile);
  const venues = venuesConfigSchema.safeParse(venuesFile);
  const badges = badgesConfigSchema.safeParse(badgesFile);
  if (!badges.success) shapeErrors("badges.json", badges.error);
  if (!workshops.success) shapeErrors("workshops.json", workshops.error);
  if (!venues.success) shapeErrors("venues.json", venues.error);
  if (!meetings.success) shapeErrors("meetings.json", meetings.error);
  if (!series.success) shapeErrors("series.json", series.error);
  if (!questions.success) shapeErrors("questions.json", questions.error);
  if (
    !meetings.success ||
    !series.success ||
    !questions.success ||
    !workshops.success ||
    !venues.success ||
    !badges.success
  ) {
    return 1;
  }

  const badgeIssues = validateBadges(badges.data);
  if (badgeIssues.length > 0) {
    for (const issue of badgeIssues) {
      process.stderr.write(
        `events: badges.json [${issue.id}] ${issue.message}\n`,
      );
    }
    return 1;
  }

  const authoredIssues = [
    ...validateCatalog(workshops.data, venues.data),
    ...validateAuthored(
      meetings.data,
      series.data,
      workshops.data,
      venues.data,
    ),
  ];
  if (authoredIssues.length > 0) {
    process.stderr.write(`${new ClubConfigError(authoredIssues).message}\n`);
    return 1;
  }
  const resolved = resolveMeetings(meetings.data, series.data.series, {
    workshops: workshops.data.workshops,
    venues: venues.data.venues,
  });
  const issues = validateClubConfig(resolved, questions.data);
  if (issues.length > 0) {
    process.stderr.write(`${new ClubConfigError(issues).message}\n`);
    return 1;
  }

  const workshopCount = resolved.meetings.reduce(
    (total, meeting) => total + meeting.agenda.length,
    0,
  );
  process.stdout.write(
    `events: ok (${resolved.meetings.length} meetings, ${series.data.series.length} series, ${workshops.data.workshops.length} workshops defined (${workshopCount} on agendas), ${venues.data.venues.length} venues, ` +
      `${questions.data.questions.length} questions)\n`,
  );
  return 0;
}

process.exit(main());
