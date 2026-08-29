import { meetings } from "~/server/db/schema";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";
import { parseDate, parseTime } from "./utils";

interface PendingMeeting {
  crn: number;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  locationStatus: "TBA" | "NCRR" | "RESERVED";
  room: string;
  buildingId: number | null;
}

/**
 * Banner writes day indicators as "Y"/"N" in some exports and as the day letter
 * or an empty cell in others. A bare `!!` read "N" as true, which would put
 * every class on every day; only an affirmative value counts.
 */
function meetsOn(indicator: string | undefined): boolean {
  if (!indicator) return false;
  const value = indicator.trim().toUpperCase();
  return value !== "" && value !== "N" && value !== "0" && value !== "FALSE";
}

export class MeetingCollector {
  private readonly pending: PendingMeeting[] = [];

  collect(row: Row): void {
    const crn = parseInt(
      row["SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER"] ?? "",
      10,
    );
    if (isNaN(crn)) return;

    const timeRaw = row.Time ?? "";
    const [startRaw, endRaw] = timeRaw.split(/\s*-\s*/);
    const buildingRaw = row.Building ?? "";
    const buildingId = parseInt(buildingRaw, 10);

    this.pending.push({
      crn,
      monday: meetsOn(row["MEETING_TIME.MONDAY_IND"]),
      tuesday: meetsOn(row["MEETING_TIME.TUESDAY_IND"]),
      wednesday: meetsOn(row["MEETING_TIME.WEDNESDAY_IND"]),
      thursday: meetsOn(row["MEETING_TIME.THURSDAY_IND"]),
      friday: meetsOn(row["MEETING_TIME.FRIDAY_IND"]),
      saturday: meetsOn(row["MEETING_TIME.SATURDAY_IND"]),
      sunday: meetsOn(row["MEETING_TIME.SUNDAY_IND"]),
      startDate: parseDate(row["MEETING_TIME.START_DATE"]),
      endDate: parseDate(row["MEETING_TIME.END_DATE"]),
      startTime: parseTime(startRaw?.trim()),
      endTime: parseTime(endRaw?.trim()),
      locationStatus:
        buildingRaw === "" || buildingRaw === "TBA"
          ? "TBA"
          : buildingRaw === "NCRR"
            ? "NCRR"
            : "RESERVED",
      room: row.Room ?? "",
      buildingId: isNaN(buildingId) ? null : buildingId,
    });
  }

  /**
   * Replaces the contents of the meetings table with the collected rows,
   * dropping any meeting whose offering didn't resolve to a valid row.
   */
  async flush(tx: DrizzleTransaction, validCrns: Set<number>): Promise<number> {
    const rows = this.pending
      .filter((m) => validCrns.has(m.crn))
      .map(({ crn, ...rest }) => ({ ...rest, offeringCrn: crn }));

    // `bulkUpsert` returns early on an empty array, so deleting first would
    // leave the table truncated — which is what a renamed CSV column used to
    // do, silently and with an ok response. Refuse the replacement instead;
    // the surrounding transaction rolls the whole scrape back.
    if (rows.length === 0 && this.pending.length > 0) {
      throw new Error(
        `MeetingParser: ${this.pending.length} meetings collected but none ` +
          `matched a valid offering — refusing to empty the meetings table.`,
      );
    }

    await tx.delete(meetings);
    await bulkUpsert(tx, meetings, rows);
    return rows.length;
  }
}
