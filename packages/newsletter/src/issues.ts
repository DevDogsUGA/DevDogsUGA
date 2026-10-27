import type { CampaignContent } from "./campaign.js";
import type { KindKey, ThemeName } from "./design.js";
/**
 * The Changelog's content: the dated sends themselves, listing events read
 * from the club config in `@devdogsuga/events`.
 *
 * Issues are versioned with semver — a send is a release. Issue copy lives
 * here rather than in the components so a copy pass before a send touches one
 * file, and so the platform's archive pages and the exported emails can never
 * disagree about what an issue said.
 */
import { getClubConfig, type Meeting } from "@devdogsuga/events";
import type { PartnerName } from "./partners.js";

/** A hero card: the meeting plus either a button or a partner's logo. */
export type FeaturedEvent = (
  { meeting: Meeting; cta: string } | { meeting: Meeting; partner: PartnerName }
) & {
  /** Colours that override the meeting's own category for this hero card. */
  kind?: KindKey;
};

export interface ChangelogIssue {
  /**
   * The design-system finish: `"cosmic"` (the default, DevDogs issues) or
   * `"paper"` (GDGC issues). Ignored when `campaign` is set, which has its
   * own layout.
   */
  theme?: ThemeName;
  /** Optional reusable GDG campaign layout; other issues retain the Changelog design. */
  campaign?: CampaignContent;
  /** Issue identifier: Changelog semver or GDGC sequential number; also the URL segment. */
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
  /** The `##` heading over the hero cards, e.g. `"happening_today"`. */
  featuredLabel: string;
  /** One hero card per event, in order; usually one. */
  featured: [FeaturedEvent, ...FeaturedEvent[]];
  upcoming: Meeting[];
  signoff: string;
}

const MEETINGS = new Map(getClubConfig().meetings.map((m) => [m.slug, m]));

/** A meeting from the club config, by slug. Throws on a typo rather than
 * rendering an issue with a hole in it. */
export function meeting(slug: string): Meeting {
  const found = MEETINGS.get(slug);
  if (found === undefined) {
    throw new Error(`No meeting "${slug}" in the club config.`);
  }
  return found;
}

/** Every event an issue lists, by its slug in the club config. */
const EVENTS = {
  coldstart: meeting("2026-09-14"),
  build1: meeting("2026-09-16"),
  nextflutter: meeting("2026-09-21"),
  build2: meeting("2026-09-23"),
  supabase: meeting("2026-09-28"),
  build3: meeting("2026-09-30"),
  build4: meeting("2026-10-05-build-session"),
  career: meeting("2026-10-05-workshop"),
  touchgrass1: meeting("2026-10-07"),
  nextflutter2: meeting("2026-10-12"),
  build5: meeting("2026-10-14"),
  g311interest: meeting("2026-10-14-georgia-311"),
  g311kickoff: meeting("2026-10-19"),
  merge1026: meeting("2026-10-26"),
  g311check1: meeting("2026-10-21"),
  g311check2: meeting("2026-10-28"),
  g311demoday: meeting("2026-10-30"),
  bugbash: meeting("2026-11-11"),
  workshopwed: meeting("2026-11-04"),
  demoday: meeting("2026-11-16"),
  touchgrass2: meeting("2026-11-18"),
};

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
    featured: [{ meeting: EVENTS.coldstart, cta: "RSVP for Cold Start" }],
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
  {
    version: "3.0.1",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 14",
    command: "changelog --date 2026-09-21",
    title: "Workshops You Won't Want to Miss (DevDogs Changelog v3.0.1)",
    preview:
      "Tonight at 6: Next.js and Flutter Workshops. Get started on your web or mobile application development journey.",
    tagline: "Feature competition #1 kicks off tonight!",
    intro:
      "But first, they're saying it's the most important workshops of the semester: Flutter and Next.js, the frameworks underpinning this year's projects. Then, we'll be kicking off our first feature competition!",
    featuredLabel: "happening_tonight",
    featured: [{ meeting: EVENTS.nextflutter, cta: "RSVP for Cold Start" }],
    upcoming: [EVENTS.build2, EVENTS.supabase, EVENTS.build3, EVENTS.career],
    signoff:
      "Doors tonight at 6 in DLW 124. Bring a laptop if you have one, but we'll get you set up to ship either way.",
  },
  {
    version: "3.0.2",
    term: "Fall 2026",
    sendLabel: "Mon · Sep 28",
    command: "changelog --date 2026-09-28",
    title: "Give Your App a Backend Tonight (DevDogs Changelog v3.0.2)",
    preview:
      "Tonight at 6: the Supabase workshop, then our first feature competition of the year kicks off.",
    tagline: "Your app gets a backend tonight.",
    intro:
      "Tonight's workshop adds Supabase to the app you started at the Next.js and Flutter workshops: sign-in, a Postgres database, and row-level security. Web and mobile tracks share one project. Then our first feature competition of the year kicks off: form a team of 2 to 4 and build a feature for the club's own platform. Entries close at 6 PM next Monday, when teams present their work.",
    featuredLabel: "happening_tonight",
    featured: [{ meeting: EVENTS.supabase, cta: "See the schedule" }],
    upcoming: [EVENTS.build3, EVENTS.build4, EVENTS.career, EVENTS.touchgrass1],
    signoff:
      "Doors tonight at 6 in DLW 124. Turn on GitHub two-factor before you come: you need it to join a team.",
  },
  {
    version: "3.0.3",
    term: "Fall 2026",
    sendLabel: "Mon · Oct 5",
    command: "changelog --date 2026-10-05",
    title:
      "Meet Recruiters from FAST Tonight, Free Food Included (DevDogs Changelog v3.0.3)",
    preview:
      "Tonight at 7: career fair prep with recruiters from FAST, plus free food. Build Session #4 starts at 6.",
    tagline: "Meet FAST tonight: be prepared for tomorrow.",
    intro:
      "The career fair is tomorrow, and tonight at 7 recruiters from FAST join us in DLW 110 to help you get ready: resume polish, portfolio pointers, and practice talking about what you've built. Bring your resume and your questions; we'll bring free food. Before that, Build Session #4 runs at 6 in DLW 124: catch up on workshop materials, work with your team, or get unblocked.",
    featuredLabel: "happening_tonight",
    featured: [
      { meeting: EVENTS.career, partner: "fast" },
      { meeting: EVENTS.build4, cta: "See the schedule" },
    ],
    upcoming: [EVENTS.touchgrass1, EVENTS.nextflutter2, EVENTS.build5],
    signoff:
      "FAST and free food tonight at 7 in DLW 110. Come at 6 to DLW 124 to get some building in first.",
  },
  {
    version: "3.1.0",
    term: "Fall 2026",
    sendLabel: "Mon · Oct 12",
    command: "changelog --date 2026-10-12",
    title: "Meet Merge Monday (DevDogs Changelog v3.1.0)",
    preview:
      "Tonight at 6: Georgia 311, then Next.js II and Flutter II side by side. Open a pull request before 8.",
    tagline: "Ship something every Monday.",
    intro:
      "Competition season is over, and every Monday from tonight on is Merge Monday, 6 to 8 in DLW 124. Pick an issue in DogDays or DogPack and open a pull request before you leave. DogDays, our schedule builder, goes to Public Beta on Nov 12, the day Spring registration opens. DogPack is a new Flutter app for finding study sessions in your classes. Members get a pilot build on Nov 12, and every UGA student can get it on Nov 19. Tonight starts at 6 with Georgia 311, a civic hackathon for the City of Mableton that we're running with GDG on Campus. All majors can join, and applications close Thursday.",
    featuredLabel: "happening_tonight",
    featured: [{ meeting: EVENTS.nextflutter2, cta: "See the schedule" }],
    upcoming: [
      EVENTS.build5,
      EVENTS.g311interest,
      EVENTS.g311kickoff,
      EVENTS.merge1026,
      EVENTS.workshopwed,
      EVENTS.demoday,
      EVENTS.touchgrass2,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Fork DogDays or DogPack before you come if you can, and we'll pair you with someone for your first PR either way. Can't make it? Apply for Georgia 311 at devdogsuga.org/georgia311 before Thursday.",
  },
  {
    version: "3.2.0",
    term: "Fall 2026",
    sendLabel: "Mon · Oct 19",
    command: "changelog --date 2026-10-19",
    title: "Georgia 311 Kicks Off Tonight (DevDogs Changelog v3.2.0)",
    preview:
      "Tonight at 6: the Georgia 311 Kickoff. Teams present at DevFest Atlanta on Friday, Oct 30.",
    tagline: "Georgia 311 starts tonight.",
    intro:
      "Tonight at 6 in DLW 124, Georgia 311 teams kick off their sprint for the City of Mableton. Not on a team? DLW 124 stays open until 8, so bring a laptop and keep working on your pull request. Teams check in on Oct 21 and 28, then present to Mableton Mayor Michael Owens at DevFest Atlanta on Friday, Oct 30.",
    featuredLabel: "happening_tonight",
    featured: [
      {
        meeting: EVENTS.g311kickoff,
        cta: "See the schedule",
      },
    ],
    upcoming: [
      EVENTS.g311check1,
      EVENTS.merge1026,
      EVENTS.g311check2,
      EVENTS.g311demoday,
      EVENTS.workshopwed,
      EVENTS.bugbash,
      EVENTS.demoday,
      EVENTS.touchgrass2,
    ],
    signoff:
      "Doors tonight at 6 in DLW 124. Georgia 311 teams start their sprint; everyone else, bring a laptop and keep building. See you there.",
  },
];

export function issueByVersion(version: string): ChangelogIssue | undefined {
  return ISSUES.find((issue) => issue.version === version);
}
