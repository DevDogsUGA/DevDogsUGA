import { describe, expect, it } from "vitest";
import {
  clubDay,
  clubDateKey,
  clubMonthStart,
  MAX_MONTHS_AHEAD,
  scheduleWindow,
} from "./eventTime";

/**
 * The zone arithmetic, tested at the one hour it goes wrong.
 *
 * Every case here is an evening meeting, on purpose. The club's ordinary 18:00
 * slot clears the UTC date rollover by two hours, so a naive implementation is
 * right for every meeting currently on the books and wrong for the first 20:00
 * social somebody schedules. The only temporal check on `meetings` is
 * `endsAt > startsAt`, so nothing in the schema stops one.
 */

describe("clubMonthStart", () => {
  it("is midnight Eastern, not midnight UTC", () => {
    // September 2026 is EDT, UTC-4. Midnight on the 1st in Athens is 04:00 UTC
    // that same morning, NOT 00:00 UTC, which is 20:00 on August 31st.
    expect(clubMonthStart({ year: 2026, month: 8 }).toISOString()).toBe(
      "2026-09-01T04:00:00.000Z",
    );
  });

  it("is UTC-5 in the winter", () => {
    // January is EST. A fixed offset would be right for one half of the year
    // and an hour out for the other.
    expect(clubMonthStart({ year: 2026, month: 0 }).toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    );
  });

  it("keeps a 20:00 meeting on the last evening of the range inside it", () => {
    // ⚠️ The regression. A social at 20:00 Eastern on 30 September has
    // `startsAt` = 2026-10-01T00:00:00Z. The old bound for "the end of
    // September" was `Date.UTC(2026, 9, 1)`, the same instant, and
    // `getMeetingsInRange` filters `startsAt < to`. The meeting sat exactly ON
    // the exclusive bound and disappeared from /events.
    const lateSocial = new Date("2026-10-01T00:00:00.000Z");
    const endOfWindow = clubMonthStart({ year: 2026, month: 9 });

    expect(lateSocial.getTime()).toBeLessThan(endOfWindow.getTime());
  });

  it("excludes the evening before the window opens", () => {
    // The mirror of the case above, and why widening the bound cannot fix it.
    // A 20:00 meeting on 31 August belongs to August; the old lower bound
    // pulled it into September's query, where `clubDay` then filed it under a
    // month the calendar's paging cannot reach.
    const augustEvening = new Date("2026-09-01T00:00:00.000Z");
    const windowOpens = clubMonthStart({ year: 2026, month: 8 });

    expect(augustEvening.getTime()).toBeLessThan(windowOpens.getTime());
    expect(clubDay(augustEvening).month).toBe(7);
  });

  it("agrees with clubDay about which month it starts", () => {
    // The bound and the bucketing come from two different functions, and a row
    // is only reachable if they agree. Checked across a year so a DST
    // transition cannot break one direction only.
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

describe("scheduleWindow", () => {
  /**
   * The forward bound, which was a constant and hid a semester.
   *
   * `/events` asked for a fixed two months ahead. Everything past that synced
   * into Postgres and appeared nowhere — not on the calendar, not in the list,
   * and not reachable by paging, since the page derives its paging bounds from
   * the same span. Reported, accurately from the outside, as "events after
   * September don't sync at all".
   */
  const august = { year: 2026, month: 7 };

  it("always looks a month back", () => {
    expect(scheduleWindow(august, null).from).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it("still spans three months when the base is empty", () => {
    // The floor. A summer with nothing on the books must still render a
    // calendar somebody can page through, not one that dead-ends on today.
    expect(scheduleWindow(august, null).to).toEqual({ year: 2026, month: 9 });
  });

  it("reaches past the floor to the last meeting on the books", () => {
    // ⚠️ The regression. A semester authored through 3 December used to stop
    // being visible at the end of September.
    const december = new Date("2026-12-03T23:00:00.000Z");
    expect(scheduleWindow(august, december).to).toEqual({
      year: 2027,
      month: 0,
    });
  });

  it("does not shrink below the floor for a near meeting", () => {
    // The base holding nothing past this week is the ordinary state for most
    // of the year, and it must not collapse the calendar to one month.
    const thisWeek = new Date("2026-08-25T22:00:00.000Z");
    expect(scheduleWindow(august, thisWeek).to).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("clamps a mistyped year rather than paging to it", () => {
    // A meeting entered as 2126 would otherwise hand the calendar twelve
    // hundred empty months to walk through.
    const typo = new Date("2126-09-15T22:00:00.000Z");
    expect(scheduleWindow(august, typo).to).toEqual(
      // August 2026 plus the cap.
      { year: 2027, month: 7 },
    );
    expect(MAX_MONTHS_AHEAD).toBe(12);
  });

  it("does not widen by a month for a 20:00 meeting on the last day", () => {
    // The rollover this whole file exists for, in its newest disguise. A
    // social at 20:00 Eastern on 31 October has `startsAt` = 1 November in
    // UTC, and reading the month off that would page the calendar a month
    // further than the base goes.
    const halloween = new Date("2026-11-01T00:00:00.000Z");
    expect(clubDay(halloween).month).toBe(9);
    expect(scheduleWindow(august, halloween).to).toEqual({
      year: 2026,
      month: 10,
    });
  });

  it("does not widen by a YEAR for one on New Year's Eve", () => {
    // The same slip, at the one boundary where it costs twelve months. A
    // 20:00 party on 31 December 2026 is 01:00 UTC on 1 January 2027, so the
    // naive reading lands the bound in February and the calendar offers a
    // month of empty squares past the end of the base.
    const newYearsEve = new Date("2027-01-01T01:00:00.000Z");
    expect(clubDay(newYearsEve)).toEqual({ year: 2026, month: 11, day: 31 });
    expect(scheduleWindow(august, newYearsEve).to).toEqual({
      year: 2027,
      month: 0,
    });
  });

  it("crosses a year end without arithmetic drift", () => {
    const november = { year: 2026, month: 10 };
    expect(scheduleWindow(november, null)).toEqual({
      from: { year: 2026, month: 9 },
      to: { year: 2027, month: 0 },
    });
  });
});
