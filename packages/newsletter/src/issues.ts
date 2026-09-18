/**
 * The Changelog's content: event data pulled from the Airtable "Meetings"
 * table (times converted to ET) and the dated sends themselves.
 *
 * Issues are versioned with semver — a send is a release. Event copy lives
 * here rather than in the components so a copy pass before a send touches one
 * file, and so the platform's archive pages and the exported emails can never
 * disagree about what an issue said.
 */
import { KIND } from "./theme.js";

export interface ChangelogEvent {
  /** The chip label — the calendar's event-type vocabulary. */
  chip: string;
  /** The event-type accent from `KIND`. */
  color: string;
  title: string;
  /** Three-letter weekday, uppercase. */
  dow: string;
  /** `"Sep 9"` — month then day, split for the stacked date column. */
  date: string;
  time: string;
  loc: string;
  rsvp: string | null;
  blurb: string;
}

export interface ChangelogIssue {
  /** Semver, doubling as the URL segment and the export filename. */
  version: string;
  term: string;
  /** The title-bar date, `"Wed · Sep 9"`. */
  sendLabel: string;
  /** The prompt line, `"changelog --date 2026-09-09"`. */
  command: string;
  /** The email subject line. */
  title: string;
  /** Inbox preview text, hidden in the body. */
  preview: string;
  tagline: string;
  intro: string;
  /** The `##` heading over the hero card, e.g. `"happening_today"`. */
  featuredLabel: string;
  featured: ChangelogEvent;
  /** The hero card's button label. */
  cta: string;
  upcoming: ChangelogEvent[];
  signoff: string;
}

const BUILD_BLURB =
  "Catch up on workshop materials, meet your teammates for hackathons, get unblocked by focus leads and officers, or just come hang out and get work done.";

const EVENTS = {
  interest: {
    chip: "Interest Meeting",
    color: KIND.interest,
    title: "Interest Meeting",
    dow: "WED",
    date: "Sep 9",
    time: "6:00 – 7:00 PM",
    loc: "DLW 110",
    rsvp: "https://uga.campuslabs.com/engage/event/12664203",
    blurb:
      "Come meet the new leadership team and get the details on all things DevDogs. Returning? Learn what's changing, what's staying the same, and how to get involved this year. Free food, too.",
  },
  coldstart: {
    chip: "Kickoff",
    color: KIND.workshop,
    title: "Cold Start",
    dow: "MON",
    date: "Sep 14",
    time: "6:00 – 7:30 PM",
    loc: "DLW 124",
    rsvp: "https://uga.campuslabs.com/engage/event/12664196",
    blurb:
      "The inaugural meeting for the 2026–2027 year. Get set up to contribute to this year's projects. Plus, a collaborative coding workshop: an introduction to Git, GitHub, and how to contribute to a team project.",
  },
  build1: {
    chip: "Build Session",
    color: KIND.build,
    title: "Build Session",
    dow: "WED",
    date: "Sep 16",
    time: "6:00 – 7:00 PM",
    loc: "DLW 124",
    rsvp: "https://uga.campuslabs.com/engage/event/12664183",
    blurb: BUILD_BLURB,
  },
  // The three workshop nights have no Description in Airtable yet — these
  // blurbs are authored from their linked workshop topics; swap in the real
  // copy once it lands in the Meetings table.
  nextflutter: {
    chip: "Workshop",
    color: KIND.workshop,
    title: "Workshops: Next.js & Flutter",
    dow: "MON",
    date: "Sep 21",
    time: "6:00 – 7:30 PM",
    loc: "DLW 124",
    rsvp: null,
    blurb:
      "A framework double-header: build for the web with Next.js and go cross-platform with Flutter.",
  },
  build2: {
    chip: "Build Session",
    color: KIND.build,
    title: "Build Session",
    dow: "WED",
    date: "Sep 23",
    time: "6:00 – 7:00 PM",
    loc: "DLW 124",
    rsvp: "https://uga.campuslabs.com/engage/event/12664184",
    blurb: BUILD_BLURB,
  },
  supabase: {
    chip: "Workshop",
    color: KIND.workshop,
    title: "Workshop: Supabase",
    dow: "MON",
    date: "Sep 28",
    time: "6:00 – 7:30 PM",
    loc: "DLW 124",
    rsvp: null,
    blurb:
      "Get hands-on with Supabase: Postgres, auth, and realtime data for this year's projects.",
  },
  build3: {
    chip: "Build Session",
    color: KIND.build,
    title: "Build Session",
    dow: "WED",
    date: "Sep 30",
    time: "6:00 – 7:00 PM",
    loc: "DLW 124",
    rsvp: "https://uga.campuslabs.com/engage/event/12664184",
    blurb: BUILD_BLURB,
  },
  career: {
    chip: "Workshop",
    color: KIND.workshop,
    title: "Workshop: Career Fair Readiness",
    dow: "MON",
    date: "Oct 5",
    time: "6:30 – 8:00 PM",
    loc: "DLW 110",
    rsvp: null,
    blurb:
      "Get ready for the fall career fair: resume polish, portfolio pointers, and how to talk about what you've built.",
  },
} satisfies Record<string, ChangelogEvent>;

export const ISSUES: ChangelogIssue[] = [
  {
    version: "3.0.0",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 14",
    command: "changelog --date 2026-09-14",
    title: "DevDogs Changelog v3.0.0: Get Started Tonight!",
    preview:
      "Tonight at 6: Cold Start. Get set up to build with us this semester.",
    tagline: "Let's boot up!",
    intro:
      "Missed the interest meeting? No problem. Cold Start is the inaugural meeting of the year. Get set up to contribute to this semester's projects, with onboarding we've streamlined so you leave ready to build.",
    featuredLabel: "happening_tonight",
    featured: EVENTS.coldstart,
    cta: "RSVP for Cold Start",
    upcoming: [
      EVENTS.build1,
      EVENTS.nextflutter,
      EVENTS.build2,
      EVENTS.supabase,
      EVENTS.build3,
      EVENTS.career,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Bring a laptop if you have one, and we'll get you set up to ship either way.",
  },
];

export function issueByVersion(version: string): ChangelogIssue | undefined {
  return ISSUES.find((issue) => issue.version === version);
}
