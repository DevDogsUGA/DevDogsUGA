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

function academicYearText(academicPeriod: number): string {
  const year = Math.floor(academicPeriod / 100);
  return academicPeriod % 100 === 8
    ? `${year} - ${year + 1}`
    : `${year - 1} - ${year}`;
}

// The registrar stores dates as "M/d/yy"; the last space-delimited token is the date.
function extractDate(cellText: string): string | null {
  const parts = cellText.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const d = parse(last, "M/d/yy", new Date());
  return isValid(d) ? format(d, "yyyy-MM-dd") : null;
}

// ─── Fetch (pure HTTP, no DB — safe to run outside a transaction) ──────────────

export async function fetchPartsOfTerm(
  academicPeriod: number,
): Promise<(typeof partsOfTerm.$inferInsert)[]> {
  // Step 1: Resolve the calendar ID for this academic year from the dropdown.
  const calendarPageRes = await fetch(
    "https://reg.uga.edu/calendars/parts-of-term",
  );
  const $page = cheerio.load(await calendarPageRes.text());
  const targetYearText = academicYearText(academicPeriod);

  let calendarId: string | undefined;
  $page("#cal_dropdown option").each((_i, el) => {
    if ($page(el).text().trim() === targetYearText) {
      calendarId = $page(el).attr("value");
    }
  });
  if (!calendarId) throw new Error(`No calendar found for "${targetYearText}"`);

  // Step 2: Fetch the calendar HTML via the registrar's AJAX endpoint.
  const ajaxRes = await fetch("https://reg.uga.edu/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `action=load_calendar&calendar_id=${calendarId}`,
  });
  const { data } = (await ajaxRes.json()) as {
    success: boolean;
    data: { html: string };
  };

  // Step 3: Parse the part-of-term rows for this semester from the calendar HTML.
  const rowId = semesterRowId(academicPeriod);
  const $cal = cheerio.load(data.html);
  const partOfTermRows: (typeof partsOfTerm.$inferInsert)[] = [];

  $cal(`#cal_section_${calendarId}_row_${rowId} tbody tr`).each((_i, tr) => {
    const cells = $cal(tr).children("td");
    const code = cells.eq(0).text().trim();
    if (!code) return;
    partOfTermRows.push({
      academicPeriod,
      code,
      description: cells.eq(1).text().trim(),
      classesBegin: extractDate(cells.eq(2).text())!,
      dropAddEnds: extractDate(cells.eq(3).text())!,
      censusDate: extractDate(cells.eq(4).text())!,
      withdrawalDeadline: extractDate(cells.eq(5).text())!,
      classesEnd: extractDate(cells.eq(6).text())!,
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
