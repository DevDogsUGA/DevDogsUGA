import { z } from "zod";
import type { ResolvedVenue } from "./venues.js";
import type { ResolvedWorkshop } from "./workshops.js";

/**
 * The shape of the club's meetings and workshops, authored as versioned data
 * rather than edited through a UI.
 *
 * This is the STRUCTURAL half of "is this config good". A file that parses
 * against this schema has the right shape and types; whether its CONTENT can
 * go on a public page -- a summary that fits its card, an RSVP link on the
 * club's own host -- is `validator.ts`'s job, run separately by `check.ts` so
 * a shape error and a publishability error are never confused for each
 * other in the CI output.
 *
 * Mirrors the columns `meetings` and `workshops` actually read today. Left
 * out on purpose: everything that exists only for a synced wire format --
 * a foreign record id, sync-status bookkeeping, attendance counts. Config has
 * no such plumbing: a meeting's identity is its authored `slug`, a workshop's
 * is its title within its meeting, and there is nothing to write status back
 * onto -- a bad file simply fails CI.
 */

// ── Shared constants ─────────────────────────────────────────────────────────
//
// Duplicated from the baseline migration's check constraints rather than
// imported from it, so this package can be validated with no database in
// reach. The numbers must keep agreeing with the check constraints in
// `supabase/migrations/20260829040000_11_platform_events_core.sql` -- this
// file must never be STRICTER than that one: config is upstream of Postgres,
// so a config file this validator accepts must never be a row Postgres
// rejects.

/** Roughly two sentences, what the events card is laid out for. */
export const MEETING_SUMMARY_MAX_LENGTH = 240;
/** A single line in a schedule row and in a dialog title. */
export const MEETING_TITLE_MAX_LENGTH = 80;
/** Shorter than the summary cap: renders inline beside a struck-through row. */
export const MEETING_CANCELLATION_REASON_MAX_LENGTH = 160;
/** A schedule row's worth of text. */
export const WORKSHOP_TITLE_MAX_LENGTH = 80;
/** What the meeting's detail dialog lays out for a workshop's description. */
export const WORKSHOP_DESCRIPTION_MAX_LENGTH = 280;

/**
 * Mirrors the database's meetings_rsvpUrl_host constraint. RSVP destinations
 * may use any HTTPS host (including Bevy), while retaining the existing
 * no-userinfo and conservative path-character guards.
 */
export const RSVP_URL_PATTERN =
  /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(\/[A-Za-z0-9/_?=&.%#:~-]*)?$/;

/**
 * What a night is, for colour and filtering. Mirrors `meetings_category_choices`
 * and `EVENT_CATEGORIES` in the platform's `eventKind.ts`. `info` is the Info
 * Session (what was the "Interest Meeting" kind); `milestone` covers Kickoff,
 * Cold Start and Demo Day.
 */
export const MEETING_CATEGORIES = [
  "build",
  "workshop",
  "social",
  "info",
  "study",
  "milestone",
] as const;

export type MeetingCategory = (typeof MEETING_CATEGORIES)[number];

/** Which visual identity a night wears: Cosmic (`devdogs`) or Paper (`gdgc`). */
export const MEETING_BRANDS = ["devdogs", "gdgc"] as const;

export type MeetingBrand = (typeof MEETING_BRANDS)[number];

/** The label each category prints. */
export const MEETING_CATEGORY_LABELS: Readonly<
  Record<MeetingCategory, string>
> = {
  build: "Build",
  workshop: "Workshop",
  social: "Social",
  info: "Info Session",
  study: "Study",
  milestone: "Milestone",
};

/** A series' or meeting's stable id: lowercase words joined by hyphens. */
export const SERIES_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The campus map's ten drawable buildings, by code. A campus venue in
 * `venues.json` names one of these as its `building`.
 */
export const CAMPUS_BUILDING_CODES = [
  "DLW",
  "Driftmier",
  "Plant Sciences",
  "Boyd",
  "MLC",
  "Science Learning Center",
  "Science Library",
  "Poultry Science",
  "Main Library",
  "Tate",
] as const;

export type CampusBuildingCode = (typeof CAMPUS_BUILDING_CODES)[number];

/** Mirrors `meetings_building_choices`: the ten buildings, plus `Other`. */
export const MEETING_BUILDING_CHOICES = [
  ...CAMPUS_BUILDING_CODES,
  "Other",
] as const;

/**
 * A meeting's slug: its Eastern date, plus a lowercase descriptor when it
 * shares the date with another meeting ("2026-10-05-judging").
 *
 * This is the meeting's identity and its address on the platform
 * (`/events/<slug>`) and on every poster. The platform matches its rows on
 * it, so changing one makes a new meeting: the old one is archived with its
 * attendance, and its URL stops resolving. The leading date also keeps a
 * slug clear of the static routes beside it (`/events/directions`).
 */
export const MEETING_SLUG_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

// ── Schema ───────────────────────────────────────────────────────────────────

/** A ISO-8601 instant. Validated as a string parseable by `Date`, rather than
 * with zod's own `.datetime()`, so the format tolerates whatever an author's
 * editor or a future generator happens to emit -- an offset, a `Z`, optional
 * fractional seconds -- as long as `new Date(value)` can make sense of it. */
const isoInstant = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "must be a valid ISO-8601 datetime",
  );

/**
 * A workshop as a night shows it: the definition's words, with the night's
 * own description when it has one. `project` is free text, deliberately: a
 * workshop recommends a body of work in words now ("DogDays", "DogDays &
 * DogPack"), the same way an officer would say it out loud.
 */
export interface Workshop {
  title: string;
  description: string | null;
  project: string | null;
}

/**
 * One line of a meeting's agenda, as authored: a workshop's id from
 * `workshops.json`, or the id with a description for this night only.
 */
export const agendaEntrySchema = z.union([
  z.string().regex(SERIES_ID_PATTERN).meta({
    description: "The id of a workshop in workshops.json.",
  }),
  z.strictObject({
    workshop: z.string().regex(SERIES_ID_PATTERN).meta({
      description: "The id of a workshop in workshops.json.",
    }),
    description: z.string().max(WORKSHOP_DESCRIPTION_MAX_LENGTH).meta({
      description:
        "Replaces the workshop's own description on this night only.",
    }),
  }),
]);

export type AgendaEntry = z.infer<typeof agendaEntrySchema>;

/**
 * A meeting as AUTHORED in `meetings.json`: the in-person moment. Its agenda
 * is the ids of the workshops running that night, from `workshops.json`; its
 * place is a venue from `venues.json` and a room.
 *
 * A meeting may name a `series` (from `series.json`) and inherit its category,
 * brand, summary, venue and room. An authored value always wins, a
 * one-off (no series) sets its own `title` and `category`, and `resolveMeetings`
 * turns this shape into the {@link Meeting} everything downstream reads.
 */
export const meetingSchema = z
  .strictObject({
    slug: z
      .string()
      .regex(
        MEETING_SLUG_PATTERN,
        'must be the Eastern date, optionally with a lowercase descriptor ("2026-10-05-judging")',
      )
      .meta({
        description:
          "The meeting's identity and its URL on the platform and posters: its Eastern date (YYYY-MM-DD), plus a lowercase descriptor when another meeting shares the date. Unique across the file. Changing it makes a new meeting.",
      }),
    series: z.string().regex(SERIES_ID_PATTERN).optional().meta({
      description:
        "The id of a series in series.json. The meeting inherits the series' category, brand, summary, venue and room, and its title is derived from the series unless one is authored.",
    }),
    title: z.string().min(1).max(MEETING_TITLE_MAX_LENGTH).optional().meta({
      description:
        "The heading on the events page and newsletter card. Always wins over the series-derived title; required for a one-off (no series).",
    }),
    summary: z.string().min(1).max(MEETING_SUMMARY_MAX_LENGTH).optional().meta({
      description:
        "About two sentences, for the events card. Defaults to the series' summary.",
    }),
    category: z.enum(MEETING_CATEGORIES).optional().meta({
      description:
        "What the night is. Defaults to the series' category; required for a one-off.",
    }),
    brand: z.enum(MEETING_BRANDS).optional().meta({
      description:
        "devdogs (Cosmic) or gdgc (Paper). Defaults to the series' brand, then devdogs.",
    }),
    venue: z.string().regex(SERIES_ID_PATTERN).optional().meta({
      description:
        "The id of a venue in venues.json. Defaults to the series' venue; a meeting that names a venue does not inherit the series' room.",
    }),
    room: z.string().min(1).optional().meta({
      description:
        "The room or space inside the venue, or \"TBA\" until there is one. Defaults to the series' room (when the venue is the series' too).",
    }),
    startsAt: isoInstant.meta({
      description:
        "ISO 8601 instant, e.g. 2026-09-14T22:00:00.000Z (6 PM Eastern).",
    }),
    endsAt: isoInstant.meta({
      description: "ISO 8601 instant, after startsAt.",
    }),
    rsvpUrl: z.url().nullable().meta({
      description:
        "An HTTPS RSVP event page, such as Bevy or the Involvement Network.",
    }),
    cancelledAt: isoInstant
      .nullable()
      .meta({ description: "When it was cancelled; null while it is on." }),
    cancellationReason: z
      .string()
      .max(MEETING_CANCELLATION_REASON_MAX_LENGTH)
      .nullable()
      .meta({
        description: "Shown beside the struck-through row. Needs cancelledAt.",
      }),
    /** The one flag that governs both star credit and EL eligibility -- see
     * the migration note on `meetings.countsForCredit`. */
    countsForCredit: z.boolean().meta({
      description:
        "Whether checking in earns a star and counts toward EL credit.",
    }),
    /** Where to send a member after a successful check-in. Null is the
     * ordinary case: most nights have nothing to redirect to. */
    surveyUrl: z.url().nullable().meta({
      description: "An outside survey linked after check-in; usually null.",
    }),
    /** This meeting's survey: meeting-scoped question ids from
     * `questions.json`, asked in this order after check-in. Member-scoped
     * questions are asked everywhere and never listed. */
    questions: z.array(z.string()).optional().meta({
      description:
        "Ids of meeting-scoped questions from questions.json to ask after check-in, in order.",
    }),
    agenda: z.array(agendaEntrySchema).meta({
      description:
        "The workshops running that night, by id from workshops.json. Parallel workshops share a meeting; sequential ones are separate meetings.",
    }),
  })
  .refine((meeting) => new Date(meeting.endsAt) > new Date(meeting.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

/** A meeting as written in `meetings.json`. */
export type AuthoredMeeting = z.infer<typeof meetingSchema>;

/**
 * A meeting once its series is applied: every field a consumer reads is
 * present. This is what `getClubConfig()` returns, and what the validator,
 * the platform's reconcile, the newsletter and the graphics all take.
 */
export interface Meeting {
  slug: string;
  /** The series id, or null for a one-off. */
  series: string | null;
  /** The resolved display title: authored, else derived from the series. */
  title: string;
  /**
   * The small line over a topic-headline night's title: the series name
   * ("Workshop Wednesday" over the workshop's topic). Null otherwise.
   */
  kicker: string | null;
  summary: string;
  category: MeetingCategory;
  brand: MeetingBrand;
  /** Where it is: the venue, with the room. */
  venue: ResolvedVenue;
  /**
   * Backwards-compatible: the campus-map building the venue maps to (`Other`
   * for somewhere the map does not draw), as the platform's `building`
   * column stores it. Derived from `venue`; readers move to `venue` later.
   */
  building: (typeof MEETING_BUILDING_CHOICES)[number] | null;
  /** Backwards-compatible: the room line printed beside `building`. */
  location: string;
  startsAt: string;
  endsAt: string;
  rsvpUrl: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  countsForCredit: boolean;
  surveyUrl: string | null;
  questions?: string[] | undefined;
  /** The workshops running that night, definitions resolved. */
  agenda: ResolvedWorkshop[];
}

export const clubConfigSchema = z.strictObject({
  /** The editor's pointer to `meetings.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  meetings: z.array(meetingSchema),
});

/** `meetings.json` as authored. */
export type AuthoredClubConfig = z.infer<typeof clubConfigSchema>;

/** The meetings, series applied: what the rest of the system reads. */
export interface ClubConfig {
  meetings: Meeting[];
}
