// Vite plugin exposing the club's upcoming-meetings data as a virtual
// module, so `UpcomingStack.vue` can list real meetings without bundling
// `@devdogsuga/events`'s `node:fs` read into the client build -- Slidev
// ships a static SPA, so there's no server around to run that read at
// request time the way the platform's own version of this component does.
//
// Filtered once, here, at build/dev time (this deck's own definition of
// "upcoming", not "now"):
//   - only meetings starting after the workshop itself begins (2026-09-28
//     18:00 America/New_York = 22:00 UTC in late September, EDT) -- see
//     04-events.md and LAYOUTS.md
//   - "Production test" fixtures skipped, same as 04-events.md's own
//     hand-written note this replaces
//   - cancelled meetings skipped
// Sorted soonest-first; `UpcomingStack` slices however many of the front it
// wants (`count`, default 3, matching the platform homepage's
// `UPCOMING_COUNT`).
import type { Plugin } from "vite";
import { getClubConfig, type Meeting } from "@devdogsuga/events";

const VIRTUAL_ID = "virtual:dd-meetings";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

const CUTOFF = "2026-09-28T22:00:00.000Z";

export interface DeckMeeting {
  slug: string;
  title: string | null;
  category: string;
  kicker: string | null;
  building: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
}

function toDeckMeeting(m: Meeting): DeckMeeting {
  return {
    slug: m.slug,
    title: m.title,
    category: m.category,
    kicker: m.kicker,
    building: m.building,
    location: m.location,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
  };
}

function upcoming(): DeckMeeting[] {
  const { meetings } = getClubConfig();
  return meetings
    .filter((m) => m.cancelledAt === null)
    .filter((m) => !(m.title ?? "").startsWith("Production test"))
    .filter((m) => m.startsAt > CUTOFF)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(toDeckMeeting);
}

export function meetingsData(): Plugin {
  return {
    name: "dd:meetings-data",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID)
        return `export const meetings = ${JSON.stringify(upcoming())}`;
    },
  };
}
