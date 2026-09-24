import { z } from "zod";

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
 * no such plumbing: identity is the authored `id` itself, and there is
 * nothing to write status back onto -- a bad file simply fails CI.
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
 * Rendered as an href on a public page under the club's name, so the host is
 * allowlisted rather than just the scheme. Mirrors the DB's
 * `meetings_rsvpUrl_host` check constraint. Adding a host here means
 * widening that check constraint in the same change.
 */
export const RSVP_URL_ALLOWED_HOSTS: readonly string[] = ["uga.campuslabs.com"];

/**
 * Exact mirror of the DB's `meetings_rsvpUrl_host` check constraint --
 * literally, not just semantically. `new URL(url).hostname` falls into
 * precisely the trap that check constraint's comment warns about: it parses
 * `http://uga.campuslabs.com/x` (wrong scheme) and
 * `https://someone@uga.campuslabs.com/x` (userinfo) happily, and both
 * hostnames land on the allowlist even though Postgres's regex rejects both
 * strings outright. Testing this pattern directly against the whole URL,
 * the same way the check constraint does, means there is nothing left for
 * `new URL()` to get cleverer about behind this validator's back -- and it
 * stays true even if `RSVP_URL_ALLOWED_HOSTS` grows a second host.
 */
export const RSVP_URL_PATTERN = new RegExp(
  `^https://(${RSVP_URL_ALLOWED_HOSTS.map((host) =>
    host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})(/[A-Za-z0-9/_?=&.%#:~-]*)?$`,
);

/** Mirrors `meetings_kind_choices`. */
export const MEETING_KIND_CHOICES = [
  "Build Session",
  "Study Session",
  "Interest Meeting",
  "Social",
] as const;

/** Mirrors `meetings_building_choices`. */
export const MEETING_BUILDING_CHOICES = [
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
  "Other",
] as const;

/**
 * The id pattern every meeting and workshop must match: a slug the
 * validator's uniqueness check and a URL can both trust.
 *
 * Permissive by design, because two very different shapes of id have to fit
 * it. A migrated row keeps its old Airtable record id verbatim ("recXXX...")
 * so the reconcile can match it to the row Airtable already created; a new
 * item gets a human slug ("cold-start-2026") instead. Both are letters,
 * digits and dashes with no leading or trailing dash, which is also exactly
 * what makes an id safe to put in a URL unescaped.
 */
export const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

// ── Schema ───────────────────────────────────────────────────────────────────

const stableId = z
  .string()
  .min(1)
  .regex(ID_PATTERN, "must be letters, digits and dashes only (a slug)");

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
 * A workshop: one of several sessions running in parallel at a meeting.
 *
 * `project` is free text, deliberately -- see the migration note on the
 * dropped `workshops.projectId` column and the `projects` table it pointed
 * at. A workshop recommends a body of work in words now ("DogDays", "DogDays
 * & DogPack"), the same way an officer would say it out loud, with nothing to
 * keep in sync.
 */
export const workshopSchema = z.object({
  id: stableId,
  title: z.string().min(1).max(WORKSHOP_TITLE_MAX_LENGTH),
  description: z.string().max(WORKSHOP_DESCRIPTION_MAX_LENGTH).nullable(),
  project: z.string().min(1).nullable(),
});

export type Workshop = z.infer<typeof workshopSchema>;

/**
 * A meeting: the in-person moment. Its agenda is the workshops running that
 * night, authored inline rather than cross-referenced, because a workshop
 * belongs to exactly one meeting and nothing else in the config ever needs
 * to point at one independently.
 */
export const meetingSchema = z
  .object({
    id: stableId,
    title: z.string().max(MEETING_TITLE_MAX_LENGTH).nullable(),
    summary: z.string().max(MEETING_SUMMARY_MAX_LENGTH).nullable(),
    kind: z.enum(MEETING_KIND_CHOICES).nullable(),
    building: z.enum(MEETING_BUILDING_CHOICES).nullable(),
    location: z.string().nullable(),
    startsAt: isoInstant,
    endsAt: isoInstant,
    rsvpUrl: z.url().nullable(),
    cancelledAt: isoInstant.nullable(),
    cancellationReason: z
      .string()
      .max(MEETING_CANCELLATION_REASON_MAX_LENGTH)
      .nullable(),
    /** The one flag that governs both star credit and EL eligibility -- see
     * the migration note on `meetings.countsForCredit`. */
    countsForCredit: z.boolean(),
    /** Where to send a member after a successful check-in. Null is the
     * ordinary case: most nights have nothing to redirect to. */
    surveyUrl: z.url().nullable(),
    agenda: z.array(workshopSchema),
  })
  .refine((meeting) => new Date(meeting.endsAt) > new Date(meeting.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export type Meeting = z.infer<typeof meetingSchema>;

export const clubConfigSchema = z.object({
  meetings: z.array(meetingSchema),
});

export type ClubConfig = z.infer<typeof clubConfigSchema>;
