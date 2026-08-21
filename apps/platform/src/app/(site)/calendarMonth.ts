import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import {
  EVENT_TZ,
  type CalendarEvent,
  type CalendarMonth,
} from "~/app/(site)/homeData";

/**
 * Server-only, deliberately split from homeData.ts: that module is imported by
 * the calendar's client components for `eventLocalDay` and its types, so it
 * compiles into the browser graph too. Nothing here is reachable from the
 * client, which is what lets it read the clock — see {@link getCalendarMonth}.
 */

/**
 * These instants are the single source for the recurrence line a card prints
 * ("Weekly on Mondays · 6:00 – 6:30 PM"), for the order two events appear in on
 * a shared day, and — via the zone — for which day that is at all. Change an
 * hour here and the card follows; there is no second copy of the schedule.
 */
function iso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  // TZDate reads these components as Athens wall-clock time, and supplies the
  // offset for that date rather than the hardcoded -04:00 this used to emit —
  // that literal is EDT, an hour off for every event between November and March.
  return format(
    new TZDate(year, month, day, hour, minute, EVENT_TZ),
    "yyyy-MM-dd'T'HH:mm:ssXXX",
  );
}

function generateMonthEvents(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();

    if (dow === 1) {
      events.push({
        id: `hackathon-${year}-${month}-${d}`,
        type: "hackathon",
        title: "Feature Hackathon",
        // Three steps, not four, and each one short enough to hold a single
        // line: the card is square at lg, so this list and the description
        // share a fixed height with no room to spill.
        description:
          "A workshop announces a feature. A week later every team that built it demos, and the best implementation wins.",
        steps: [
          "Teams of up to four get a week to build it",
          "Demos judged on requirements shipped",
          "The winning pull request gets merged",
        ],
        recurring: true,
        start: iso(year, month, d, 18, 0),
        end: iso(year, month, d, 18, 30),
      });
      events.push({
        id: `workshop-${year}-${month}-${d}`,
        type: "workshop",
        title: "Weekly Workshop",
        description:
          "A hands-on session covering a technical concept directly relevant to the current project — taught by members, for members. Most workshops close by announcing the feature the next hackathon is built around.",
        recurring: true,
        start: iso(year, month, d, 18, 30),
        end: iso(year, month, d, 19, 30),
      });
    }

    // Wednesday, so the session lands squarely between the Monday that opens a
    // competition and the Monday that judges it.
    if (dow === 3) {
      events.push({
        id: `build-${year}-${month}-${d}`,
        type: "build",
        title: "Build Session",
        description:
          "Optional open work time mid-hackathon. Bring your laptop, pair with your team, get unblocked, or just ship.",
        recurring: true,
        start: iso(year, month, d, 18, 0),
        end: iso(year, month, d, 19, 0),
      });
    }
  }

  // Career placeholder — first Tuesday of next month
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let d = 1; d <= 7; d++) {
    if (new Date(nextYear, nextMonth, d).getDay() === 2) {
      events.push({
        id: `career-${nextYear}-${nextMonth}-${d}`,
        type: "career",
        title: "Employer Event",
        description:
          "Network with recruiters and engineers from companies actively hiring DevDogs members.",
        start: iso(nextYear, nextMonth, d, 17, 0),
        end: iso(nextYear, nextMonth, d, 19, 0),
      });
      break;
    }
  }

  return events;
}

/**
 * The month the homepage calendar renders, with the events that fall in it.
 *
 * Everything time-dependent about the homepage is resolved here, once, and
 * handed down as plain data. Two constraints shape that:
 *
 * 1. **The clock may only be read inside a cache scope.** This runs during the
 *    homepage's `"use cache"` render, so the value is resolved at prerender
 *    time and baked into the static output. It used to run at *module scope*
 *    instead, which put the read outside any cache scope and made the entire
 *    page a dynamic hole: the prerendered shell held nothing but the nav
 *    chrome, every request re-rendered the whole marketing page, and a render
 *    that failed to settle surfaced as React #419 — the reload loop.
 * 2. **The consumers are client components.** A client component's SSR pass
 *    cannot sit inside `"use cache"`, so it can never read the clock without
 *    dropping the page back out of the shell — and it would compute one month
 *    during SSR and possibly another on hydration. Resolving the frame here and
 *    passing it down as data is what keeps both passes in agreement.
 */
export function getCalendarMonth(): CalendarMonth {
  const now = new TZDate(Date.now(), EVENT_TZ);
  const year = now.getFullYear();
  const month = now.getMonth();

  return {
    year,
    month,
    today: now.getDate(),
    now: now.toISOString(),
    events: generateMonthEvents(year, month),
  };
}
