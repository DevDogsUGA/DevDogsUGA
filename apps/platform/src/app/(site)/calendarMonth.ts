import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import {
  EVENT_TZ,
  type CalendarEvent,
  type CalendarMonth,
} from "~/app/(site)/homeData";

/**
 * Server-only, deliberately split from homeData.ts: that module is imported by
 * the calendar's client components for `formatEventTime` and its types, so it
 * compiles into the browser graph too. Nothing here is reachable from the
 * client, which is what lets it read the clock — see {@link getCalendarMonth}.
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
        title: "Hackathon Presentations",
        description:
          "Teams present the features they shipped during the sprint. See real progress, give feedback, and celebrate wins.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 18, 30),
        end: iso(year, month, d, 19, 0),
      });
      events.push({
        id: `workshop-${year}-${month}-${d}`,
        type: "workshop",
        title: "Weekly Workshop",
        description:
          "A hands-on session covering a technical concept directly relevant to the current project — taught by members, for members.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 19, 0),
        end: iso(year, month, d, 20, 0),
      });
    }

    if (dow === 4) {
      events.push({
        id: `devhours-${year}-${month}-${d}`,
        type: "devhours",
        title: "Dev / Office Hours",
        description:
          "Optional open work session. Bring your laptop, get unblocked, pair with teammates, or just ship.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 18, 30),
        end: iso(year, month, d, 20, 0),
      });
    }
  }

  // Career placeholder — first Tuesday of next month at noon
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
        location: "Boyd GSRC 303",
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
