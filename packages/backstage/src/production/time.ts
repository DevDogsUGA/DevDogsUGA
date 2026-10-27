/**
 * Dates as officers type them. The pure day arithmetic lives in
 * `@devdogsuga/events/exports` (shared with the console); this adds the flag
 * parser, which words its failures as CLI usage errors.
 */
import { UsageError } from "@devdogsuga/cli-core/ui";
import { endOfDay, isDay, startOfDay } from "@devdogsuga/events/exports";

export {
  dayOf,
  endOfDay,
  EVENT_TZ,
  isDay,
  startOfDay,
} from "@devdogsuga/events/exports";

/**
 * A `--from`/`--to` value: a day (the whole Eastern day, `to` inclusive) or
 * a full ISO timestamp (exact). Returns the bound to compare with: `from` is
 * inclusive, `to` exclusive.
 */
export function parseBound(
  flag: "--from" | "--to",
  text: string | undefined,
): Date | undefined {
  if (!text) return undefined;
  if (isDay(text)) {
    return flag === "--from" ? startOfDay(text) : endOfDay(text);
  }
  const at = new Date(text);
  if (/T\d{2}:\d{2}/.test(text) && !Number.isNaN(at.getTime())) return at;
  throw new UsageError(
    `${flag} takes a day (2026-09-30) or a timestamp (2026-09-30T18:00:00-04:00), not "${text}".`,
  );
}
