import {
  meetingCardDetail,
  meetingLocation,
  workshopCardDetail,
  type CardableMeeting,
  type EventDetail,
} from "@devdogsuga/sdk/brand/event";
import { workshopLabel, type TitleableWorkshop } from "~/lib/meetingTitle";

/**
 * What a meeting can be drawn as: the whole night, and each workshop on it.
 *
 * A **subject** is the picture's content; a **format** is its size (see the
 * SDK's `formats.ts`). The console previews every subject at every format, so
 * this module only decides the subjects and the strings on each.
 *
 * Pure on purpose (no database, no renderer): the loader hands in rows, and
 * tests can pin what a card says without standing anything up.
 */

/** The field overrides a saved personal revision supplies (C2, not built yet). */
export type GraphicRevision = Partial<
  Pick<
    EventDetail,
    "title" | "date" | "time" | "location" | "kicker" | "agenda"
  >
>;

export interface GraphicSubject {
  /** `meeting`, or `workshop-<id>`. Stable, and safe in a URL. */
  id: string;
  kind: "meeting" | "workshop";
  /** What the preview calls it. */
  label: string;
  /** The filename's stem, unique within the meeting. */
  stem: string;
  detail: EventDetail;
}

export interface SubjectWorkshop extends TitleableWorkshop {
  workshopId: string;
}

export interface SubjectInput {
  meeting: CardableMeeting;
  /** The resolved title (series applied), as the page's own heading gives it. */
  title: string;
  workshops: readonly SubjectWorkshop[];
  /**
   * Personal edits to show instead of the official fields.
   *
   * This is the seam for the "use my saved edits / show official" toggle that
   * C2's personal revisions will drive: the caller loads the officer's saved
   * fields and passes them here, or passes nothing for the official card. No
   * revisions exist yet, so every caller passes nothing today.
   */
  revision?: GraphicRevision;
}

/** `Workshop: Supabase II` is how the agenda lines read on the night's card. */
function agendaLine(label: string): string {
  return `Workshop: ${label}`;
}

/** A readable, URL-safe filename component. */
export function stemPart(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workshop"
  );
}

/** Overlays a saved revision's fields on the official ones. */
export function applyRevision(
  official: EventDetail,
  revision: GraphicRevision | undefined,
): EventDetail {
  if (!revision) return official;
  const next = { ...official };
  for (const [key, value] of Object.entries(revision)) {
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  return next;
}

/** True when a revision actually changes something the card shows. */
export function revisionDiffers(
  official: EventDetail,
  revision: GraphicRevision | undefined,
): boolean {
  if (!revision) return false;
  const merged = applyRevision(official, revision);
  return JSON.stringify(merged) !== JSON.stringify(official);
}

/**
 * The subjects for one meeting, the whole night first.
 *
 * Every workshop on the night gets its own subject, even a night with only one:
 * the console asks for "one per workshop", and a poster for the workshop alone
 * is a different thing to hand out than the night's.
 */
export function meetingSubjects({
  meeting,
  title,
  workshops,
  revision,
}: SubjectInput): GraphicSubject[] {
  const labels = workshops.map((workshop) => workshopLabel(workshop));
  const official = meetingCardDetail({
    meeting,
    title,
    agenda: labels.map(agendaLine),
    location: meetingLocation(meeting.building, meeting.location),
  });
  const night = applyRevision(official, revision);

  const taken = new Map<string, number>();
  const items = workshops.map((workshop, index): GraphicSubject => {
    const label = labels[index]!;
    const part = stemPart(label);
    const seen = (taken.get(part) ?? 0) + 1;
    taken.set(part, seen);

    return {
      id: `workshop-${workshop.workshopId}`,
      kind: "workshop",
      label,
      stem: `${meeting.slug}-${seen === 1 ? part : `${part}-${seen}`}`,
      detail: workshopCardDetail(night, label),
    };
  });

  return [
    {
      id: "meeting",
      kind: "meeting",
      label: night.title,
      stem: meeting.slug,
      detail: night,
    },
    ...items,
  ];
}
