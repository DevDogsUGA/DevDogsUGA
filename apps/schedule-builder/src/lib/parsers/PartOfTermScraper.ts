import * as cheerio from "cheerio";
import { format, isValid, parse } from "date-fns";
import { getColumns, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { partsOfTerm } from "~/server/db/schema";
import type { DrizzleTransaction } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function semesterRowId(academicPeriod: number): number {
  switch (academicPeriod % 100) {
    case 8:
      return 1; // Fall
    case 2:
      return 2; // Spring
    case 5:
      return 3; // Summer
    default:
      throw new Error(`Invalid academic period: ${academicPeriod}`);
  }
}

// The registrar stores dates as "M/d/yy"; the last space-delimited token is the date.
function extractDate(cellText: string): string | null {
  const parts = cellText.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const d = parse(last, "M/d/yy", new Date());
  return isValid(d) ? format(d, "yyyy-MM-dd") : null;
}

// ─── Calendar ID Resolver ─────────────────────────────────────────────────────

export class CalendarNotFoundError extends Error {
  override readonly name = "CalendarNotFoundError";
}

export class CalendarIndexUnavailableError extends Error {
  override readonly name = "CalendarIndexUnavailableError";
}

function academicYearStart(academicPeriod: number): number {
  const year = Math.floor(academicPeriod / 100);
  return academicPeriod % 100 === 8 ? year : year - 1;
}

// The registrar's public year-selector page can respond with a Cloudflare
// challenge to non-browser HTTP clients. These are deliberately explicit
// rather than calculated: calendar IDs are not chronological (1514 is
// 2024-2025).
// Keep the selector as the source of truth whenever it is reachable, and use
// this small, verified map only when the selector itself is unavailable.
const KNOWN_CALENDAR_IDS: Readonly<Record<number, string>> = {
  2025: "1512",
  2026: "1513",
};

const REGISTRAR_REQUEST_HEADERS = {
  Accept: "application/json, text/html;q=0.9",
  // reg.uga.edu rejects requests with no User-Agent. Workers' outbound fetch
  // does not add one, so identify this scraper explicitly.
  "User-Agent": "DevDogsUGA Schedule Builder/1.0",
} as const;

export function resolveKnownCalendarId(
  academicPeriod: number,
): string | undefined {
  return KNOWN_CALENDAR_IDS[academicYearStart(academicPeriod)];
}

export function resolveCalendarId(
  $page: ReturnType<typeof cheerio.load>,
  academicPeriod: number,
): string {
  const startingYear = academicYearStart(academicPeriod);

  if ($page("select.cal-year-select").length === 0) {
    throw new CalendarIndexUnavailableError(
      "Registrar calendar index did not contain its year selector",
    );
  }

  // Iterate through options in the calendar year selector
  let calendarId: string | undefined;
  $page("select.cal-year-select option").each((_i, el) => {
    const $el = $page(el);

    // Skip Archive entries (data-nav="url")
    if ($el.attr("data-nav") === "url") {
      return;
    }

    // Extract the leading 4-digit year from the option text
    // Normalize whitespace and handle various dash variants
    const optionText = $el.text().trim().replace(/\s+/g, " ");
    const matchedYear = /^(\d{4})/.exec(optionText)?.[1];

    if (
      matchedYear !== undefined &&
      parseInt(matchedYear, 10) === startingYear
    ) {
      calendarId = $el.attr("value");
    }
  });

  if (!calendarId) {
    throw new CalendarNotFoundError(
      `No calendar found for academic period ${academicPeriod}`,
    );
  }

  return calendarId;
}

// ─── Fetch (pure HTTP, no DB, safe to run outside a transaction) ───────────────

export async function fetchPartsOfTerm(
  academicPeriod: number,
): Promise<(typeof partsOfTerm.$inferInsert)[]> {
  // Step 1: Resolve the calendar ID for this academic year from the dropdown.
  let calendarId: string;
  try {
    const calendarPageRes = await fetch(
      "https://reg.uga.edu/calendars/parts-of-term/",
      { headers: REGISTRAR_REQUEST_HEADERS },
    );
    if (!calendarPageRes.ok) {
      throw new CalendarIndexUnavailableError(
        `Registrar calendar index returned HTTP ${calendarPageRes.status}`,
      );
    }
    const $page = cheerio.load(await calendarPageRes.text());
    calendarId = resolveCalendarId($page, academicPeriod);
  } catch (error) {
    if (!(error instanceof CalendarIndexUnavailableError)) throw error;

    const knownCalendarId = resolveKnownCalendarId(academicPeriod);
    if (!knownCalendarId) throw error;
    calendarId = knownCalendarId;
    console.warn(
      `[parts-of-term] ${error.message}; using verified calendar ${calendarId}`,
    );
  }

  // Step 2: Fetch the calendar HTML via the registrar's AJAX endpoint.
  const ajaxRes = await fetch("https://reg.uga.edu/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: {
      ...REGISTRAR_REQUEST_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `action=load_calendar&calendar_id=${calendarId}`,
  });
  if (!ajaxRes.ok) {
    throw new Error(
      `Registrar calendar endpoint returned HTTP ${ajaxRes.status}`,
    );
  }
  const { success, data } = (await ajaxRes.json()) as {
    success: boolean;
    data?: { html?: string; terms_html?: string };
  };
  if (!success || !data?.html) {
    throw new Error(`Registrar calendar ${calendarId} returned no HTML`);
  }

  // A stale map must fail loudly instead of attaching another academic year's
  // dates to this period. The AJAX response labels each semester and year.
  const periodYear = Math.floor(academicPeriod / 100);
  const semester =
    academicPeriod % 100 === 8
      ? "Fall"
      : academicPeriod % 100 === 2
        ? "Spring"
        : academicPeriod % 100 === 5
          ? "Summer"
          : undefined;
  if (!semester) throw new Error(`Invalid academic period: ${academicPeriod}`);
  const expectedTerm = `${semester} ${periodYear}`;
  const termsText = cheerio.load(data.terms_html ?? "").text();
  if (!termsText.includes(expectedTerm)) {
    throw new Error(
      `Registrar calendar ${calendarId} does not contain ${expectedTerm}`,
    );
  }

  // Step 3: Parse the part-of-term rows for this semester from the calendar HTML.
  const rowId = semesterRowId(academicPeriod);
  const $cal = cheerio.load(data.html);
  const partOfTermRows: (typeof partsOfTerm.$inferInsert)[] = [];

  $cal(`#cal_section_${calendarId}_row_${rowId} tbody tr`).each((_i, tr) => {
    const cells = $cal(tr).children("td");
    const code = cells.eq(0).text().trim();
    if (!code) return;

    const classesBegin = extractDate(cells.eq(2).text());
    const dropAddEnds = extractDate(cells.eq(3).text());
    const censusDate = extractDate(cells.eq(4).text());
    const withdrawalDeadline = extractDate(cells.eq(5).text());
    const classesEnd = extractDate(cells.eq(6).text());

    // These five are `notNull` columns. Asserting them non-null turned one
    // unparseable registrar cell into a constraint violation that rolled back
    // the entire term scrape; skipping the row keeps the rest of the term.
    if (
      !classesBegin ||
      !dropAddEnds ||
      !censusDate ||
      !withdrawalDeadline ||
      !classesEnd
    ) {
      console.warn(
        `[parts-of-term] skipping ${academicPeriod} "${code}": unparseable date`,
      );
      return;
    }

    partOfTermRows.push({
      academicPeriod,
      code,
      description: cells.eq(1).text().trim(),
      classesBegin,
      dropAddEnds,
      censusDate,
      withdrawalDeadline,
      classesEnd,
      finalsEnd: extractDate(cells.eq(7).text()),
    });
  });

  return partOfTermRows;
}

// ─── Upsert (DB only) ───────────────────────────────────────────────────────

export async function upsertPartsOfTerm(
  tx: DrizzleTransaction,
  rows: (typeof partsOfTerm.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;

  const cols = getColumns(partsOfTerm) as Record<string, PgColumn>;
  const set = Object.fromEntries(
    (
      [
        "description",
        "classesBegin",
        "dropAddEnds",
        "censusDate",
        "withdrawalDeadline",
        "classesEnd",
        "finalsEnd",
      ] as const
    ).map((k) => [k, sql.raw(`EXCLUDED."${cols[k]!.name}"`)]),
  );

  await tx
    .insert(partsOfTerm)
    .values(rows)
    .onConflictDoUpdate({
      target: [partsOfTerm.academicPeriod, partsOfTerm.code],
      set,
    });
}
