#!/usr/bin/env node
import { z } from "zod";
import { getClubConfig, ClubConfigError } from "./index.js";

/**
 * `pnpm --filter @devdogsuga/club-config check` -- the CI gate.
 *
 * Config is validated exactly once, here, before it ever reaches a deploy:
 * the runtime reconcile (`server/config/reconcile.ts`) trusts what it parses
 * and refuses to partially apply a bad file rather than re-validating field
 * by field, so THIS is the only place an author gets a readable error. Wired
 * into `.github/workflows/ci.yaml` as a merge-blocking step.
 */
function main(): number {
  try {
    const config = getClubConfig();
    const meetingCount = config.meetings.length;
    const workshopCount = config.meetings.reduce(
      (total, meeting) => total + meeting.agenda.length,
      0,
    );
    process.stdout.write(
      `club-config: ok (${meetingCount} meetings, ${workshopCount} workshops)\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof ClubConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    if (error instanceof z.ZodError) {
      process.stderr.write(
        "club-config: data/meetings.json does not match the schema:\n",
      );
      for (const issue of error.issues) {
        process.stderr.write(`  ${issue.path.join(".")}: ${issue.message}\n`);
      }
      return 1;
    }
    throw error;
  }
}

process.exit(main());
