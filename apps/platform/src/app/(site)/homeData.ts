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
  start: string; // ISO 8601, e.g. "2026-05-13T18:30:00-04:00"
  end: string; // ISO 8601
  rsvpUrl?: string;
}

/**
 * Events happen in Athens, GA. Nothing user-facing prints a clock time — the
 * calendar shows which day something falls on and no more — but the day itself
 * still has to be decided in this zone rather than the ambient one, or an
 * evening event files under tomorrow's square the moment the server runs in UTC.
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
