import { getSeries } from "@devdogsuga/events";

/**
 * The small line over a topic-headline night's title: its series' name
 * ("Workshop Wednesday" over the workshop's topic). Null for any night whose
 * series leads with its own name, for a one-off, and for a topic night whose
 * title is already the series name (no workshop announced yet), matching the
 * events resolver's `deriveTitle`, so the name never prints twice.
 *
 * Server-side only, on purpose: it reads `series.json`, which a client
 * component must not pull into its bundle. Callers hand the string down.
 */
export function seriesKicker(
  series: string | null,
  title: string,
): string | null {
  if (series === null) return null;
  const found = getSeries().series.find((s) => s.id === series);
  if (found?.headline !== "topic" || title === found.name) return null;
  return found.name;
}
