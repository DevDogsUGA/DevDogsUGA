import type { AvailableTerm } from "./AvailableTerms";
import { fetchPartsOfTerm } from "./PartOfTermScraper";
import type { partsOfTerm } from "~/server/db/schema";

type PartOfTermRow = typeof partsOfTerm.$inferInsert;

export type ResolvedTerm = AvailableTerm & {
  partOfTermRows: PartOfTermRow[];
};

export type FailedTerm = {
  academicPeriod: number;
  reason: string;
};

export type PartsOfTermResolution = {
  succeeded: ResolvedTerm[];
  failed: FailedTerm[];
};

// Parts-of-term is required for every term (it drives course start/end
// dates), but the registrar's calendar lookup is unreliable per-term — e.g.
// a missing calendar year for a given academic period. Resolving all terms
// with a single `Promise.all` means one bad term rejects the whole batch and
// takes down siblings that would otherwise have succeeded. Instead, each
// term's fetch is isolated: failures (thrown errors or empty results) are
// collected per-term and excluded from `succeeded`, but never propagate out
// of this function.
export async function resolvePartsOfTermPerTerm(
  availableTerms: AvailableTerm[],
  fetchFn: (
    academicPeriod: number,
  ) => Promise<PartOfTermRow[]> = fetchPartsOfTerm,
): Promise<PartsOfTermResolution> {
  const succeeded: ResolvedTerm[] = [];
  const failed: FailedTerm[] = [];

  await Promise.all(
    availableTerms.map(async (term) => {
      try {
        const partOfTermRows = await fetchFn(term.academicPeriod);
        if (partOfTermRows.length === 0) {
          failed.push({
            academicPeriod: term.academicPeriod,
            reason: `no parts-of-term rows resolved for academic period ${term.academicPeriod}`,
          });
          return;
        }
        succeeded.push({ ...term, partOfTermRows });
      } catch (err) {
        failed.push({
          academicPeriod: term.academicPeriod,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return { succeeded, failed };
}
