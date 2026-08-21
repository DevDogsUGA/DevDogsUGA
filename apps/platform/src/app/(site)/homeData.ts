import jack from "~/assets/jack.jpg";
import kade from "~/assets/kade.jpg";
import maya from "~/assets/maya.jpg";
import nandan from "~/assets/nandan.jpg";
import rayan from "~/assets/rayan.jpg";
import samantha from "~/assets/samantha.jpg";
import sloan from "~/assets/sloan.jpg";
import zayan from "~/assets/zayan.jpg";
import anika from "~/assets/anika.png";
import type { LeaderHoverCardProps } from "~/components/LeadershipSection/LeaderCluster/LeaderHoverCard";

export type EventType = "workshop" | "hackathon" | "build" | "career";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  /**
   * Ordered beats that explain the format, rendered in place of the
   * time/place footer these cards used to carry. Reserved for the event types
   * whose shape is not obvious from the name — the competition, mainly.
   */
  steps?: string[];
  /**
   * Set when this type meets on the same day every week, which is what lets a
   * card say "Weekly on Mondays" instead of naming one date. The day and the
   * clock times are read back off `start`/`end` rather than written out
   * separately — see {@link formatRecurrence} — so the sentence on the card and
   * the square on the calendar can never disagree. Career events are one-offs
   * and leave it unset.
   *
   * A string names *what* recurs, for the case where the slot is one moment
   * inside a longer thing: the hackathon runs all week, but the presentations
   * are the half hour on the calendar, so it passes "Presentations" and the
   * card reads "Presentations weekly on Mondays". `true` takes the plain form.
   */
  recurring?: true | string;
  /**
   * A line under the recurrence, for how this slot sits against another one —
   * the workshop following straight on from the presentations. Kept separate
   * from the description because it is scheduling, and it belongs beside the
   * time rather than in the prose.
   */
  note?: string;
  start: string; // ISO 8601, e.g. "2026-05-13T18:30:00-04:00"
  end: string; // ISO 8601
  rsvpUrl?: string;
}

/**
 * Events happen in Athens, GA. Every date and time here is formatted in that
 * zone rather than the ambient one, so the server and the browser produce
 * identical text — `toLocaleTimeString()` would render the server's zone during
 * SSR and the visitor's on hydration, which React resolves by discarding the
 * server HTML.
 */
export const EVENT_TZ = "America/New_York";

export interface CalendarMonth {
  year: number;
  /** 0-indexed, matching `Date#getMonth`. */
  month: number;
  /** Day of the month in {@link EVENT_TZ}, for the "today" highlight. */
  today: number;
  /** The instant this frame was generated, for "is this event still upcoming?". */
  now: string;
  events: CalendarEvent[];
}

// Intl formatters rather than @date-fns/tz: TZDate's constructor runs
// `new Date()` on every construction (see date/mini.js), and these run inside
// client components during the prerender, where a clock read cannot be covered
// by "use cache" and silently drops the whole page out of the static shell.
// Intl.DateTimeFormat with an explicit timeZone is pure — same output on the
// server and in the browser, no clock involved.
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: EVENT_TZ,
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: EVENT_TZ,
});

/**
 * "Weekly on Mondays · 6:00 – 6:30 PM", built from the event's own instants —
 * or "Presentations weekly on Mondays · …" when `recurring` names a subject.
 *
 * The meridiem is printed once when both ends share it, which every current
 * event does; an evening-to-night event would still read correctly because the
 * check is on the rendered suffix rather than assumed.
 */
export function formatRecurrence(
  start: string,
  end: string,
  recurring: true | string = true,
): string {
  const s = new Date(start);
  const e = new Date(end);
  const startText = TIME_FORMAT.format(s);
  const endText = TIME_FORMAT.format(e);
  const [startClock, startMeridiem] = startText.split(" ");
  const endMeridiem = endText.split(" ")[1];
  const range =
    startMeridiem === endMeridiem
      ? `${startClock} – ${endText}`
      : `${startText} – ${endText}`;
  const day = `${WEEKDAY_FORMAT.format(s)}s`;
  return typeof recurring === "string"
    ? `${recurring} weekly on ${day} · ${range}`
    : `Weekly on ${day} · ${range}`;
}

/**
 * The calendar date an event falls on, in {@link EVENT_TZ}.
 *
 * Read straight off the ISO string, whose date part is already Athens
 * wall-clock time (see `iso()` in calendarMonth.ts). Parsing it into a `Date`
 * and asking for `getDate()` would answer in the *ambient* zone instead, which
 * files a 20:00 event under the next day once the server runs in UTC.
 */
export function eventLocalDay(startIso: string): {
  month: number;
  day: number;
} {
  const [, month, day] = startIso.slice(0, 10).split("-").map(Number);
  return { month: month! - 1, day: day! };
}

export const execBoard: LeaderHoverCardProps[] = [
  {
    name: "Kade Styron",
    titles: ["President"],
    imageSrc: kade,
    pronouns: "he/him",
    year: "2026",
    majors: ["Computer Science"],
    bio: "Kade leads DevDogs with a focus on systems design and community impact. He started as a contributor in his sophomore year and has since grown the club to 350+ members.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Sloan Finger",
    titles: ["Vice President"],
    imageSrc: sloan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science", "Statistics"],
    bio: "Sloan coordinates cross-team operations and leads the DevDogs platform project. He's passionate about developer tooling and open-source collaboration.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Jack Harrington",
    titles: ["Project Manager"],
    imageSrc: jack,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science"],
    minors: ["Business Administration"],
    bio: "Jack keeps projects on track and teams aligned. He facilitates sprint planning, backlog grooming, and ensures every member's work contributes to the release.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Anika Khatri",
    titles: ["Membership & Analytics Chair"],
    imageSrc: anika,
    pronouns: "she/her",
    year: "2028",
    majors: ["Data Science"],
    minors: ["Statistics"],
    bio: "Anika drives member engagement using data. She tracks retention metrics, designs onboarding flows, and ensures every new member finds their place in the club.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Maya Castillo",
    titles: ["Social Media Manager"],
    imageSrc: maya,
    pronouns: "she/her",
    year: "2027",
    majors: ["Marketing"],
    minors: ["Computer Science"],
    bio: "Maya crafts DevDogs' voice across platforms. She produces event content, behind-the-scenes stories, and runs recruitment campaigns that bring in top talent each semester.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Samantha Scalzini",
    titles: ["UI/UX Lead"],
    imageSrc: samantha,
    pronouns: "she/her",
    year: "2026",
    majors: ["Graphic Design"],
    minors: ["Computer Science"],
    certificates: ["UX Research"],
    bio: "Samantha shapes every user-facing product decision at DevDogs. She runs design reviews, maintains the design system, and mentors members on interaction design.",
    portfolioUrl: "https://devdogsuga.org",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Nandan Praveen",
    titles: ["Post Collections Lead"],
    imageSrc: nandan,
    pronouns: "he/him",
    year: "2028",
    majors: ["Computer Science"],
    bio: "Nandan leads the data collection pipeline for the Community Resource Forum. He ensures the dataset is accurate, up-to-date, and accessible to Athens residents.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Zayan Hoodani",
    titles: ["Event Pipeline Lead"],
    imageSrc: zayan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science", "Mathematics"],
    bio: "Zayan builds the event ingestion and scheduling infrastructure that powers DevDogs' weekly workshops and presentations. He loves systems architecture and automation.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Rayan Batada",
    titles: ["Recommendation Engine Lead"],
    imageSrc: rayan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science"],
    minors: ["Statistics"],
    bio: "Rayan develops the ML-powered recommendation engine that personalises resource discovery for Athens community members. He's particularly interested in applied NLP.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
];
