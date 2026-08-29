import { describe, expect, it } from "vitest";
import { clubDay, clubDateKey, clubMonthStart } from "./eventTime";

/**
 * The zone arithmetic, tested at the one hour it goes wrong.
 *
 * Every case here is an evening meeting. That is deliberate and it is the
 * whole point: the club's ordinary 18:00 slot clears the UTC date rollover by
 * two hours, so a naive implementation is right for every meeting currently on
 * the books and wrong for the first 20:00 social somebody schedules. Nothing
 * in the schema constrains the hour — the only temporal check on `meetings` is
 * `endsAt > startsAt` — so "no fixture has ever had one" is not a guarantee,
 * it is the reason the bug survived.
 */

describe("clubMonthStart", () => {
  it("is midnight Eastern, not midnight UTC", () => {
    // September 2026 is EDT, UTC-4. Midnight on the 1st in Athens is 04:00 UTC
    // that same morning — NOT 00:00 UTC, which is 20:00 on August 31st.
    expect(clubMonthStart({ year: 2026, month: 8 }).toISOString()).toBe(
      "2026-09-01T04:00:00.000Z",
    );
  });

  it("is UTC-5 in the winter", () => {
    // January is EST. Getting this from a fixed offset rather than from the
    // zone would be right for one half of the year and an hour out for the
    // other.
    expect(clubMonthStart({ year: 2026, month: 0 }).toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    );
  });

  it("keeps a 20:00 meeting on the last evening of the range inside it", () => {
    // ⚠️ The regression. A social at 20:00 Eastern on 30 September has
    // `startsAt` = 2026-10-01T00:00:00Z. The old bound for "the end of
    // September" was `Date.UTC(2026, 9, 1)` = 2026-10-01T00:00:00Z, and
    // `getMeetingsInRange` filters `startsAt < to` — so the meeting sat
    // exactly ON the exclusive bound and disappeared from /events completely.
    const lateSocial = new Date("2026-10-01T00:00:00.000Z");
    const endOfWindow = clubMonthStart({ year: 2026, month: 9 });

    expect(lateSocial.getTime()).toBeLessThan(endOfWindow.getTime());
  });

  it("excludes the evening before the window opens", () => {
    // The mirror of the case above, and the reason this cannot be fixed by
    // widening the bound. A 20:00 meeting on 31 August belongs to August; the
    // old lower bound pulled it into September's query, where `clubDay` then
    // filed it under a month the calendar's paging cannot reach.
    const augustEvening = new Date("2026-09-01T00:00:00.000Z");
    const windowOpens = clubMonthStart({ year: 2026, month: 8 });

    expect(augustEvening.getTime()).toBeLessThan(windowOpens.getTime());
    expect(clubDay(augustEvening).month).toBe(7);
  });

  it("agrees with clubDay about which month it starts", () => {
    // The invariant that actually matters: the bound and the bucketing are
    // derived by two different functions, and a row is only reachable if they
    // agree. Checked across a year so a DST transition cannot break it in one
    // direction only.
    for (let month = 0; month < 12; month++) {
      const start = clubMonthStart({ year: 2026, month });
      expect(clubDay(start)).toEqual({ year: 2026, month, day: 1 });
    }
  });

  it("names the first of the month in the club's zone", () => {
    expect(clubDateKey(clubMonthStart({ year: 2026, month: 8 }))).toBe(
      "2026-09-01",
    );
  });
});
