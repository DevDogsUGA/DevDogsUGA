import {
  CAMPUS_BUILDING_CODES,
  MEETING_BRANDS,
  MEETING_CATEGORIES,
  MEETING_CATEGORY_LABELS,
  VENUE_KINDS,
} from "@devdogsuga/events";
import { clubLocalToIso, isoToClubLocal } from "~/lib/clubLocalTime";

/**
 * What the schedule editor can change and how each field reads and writes.
 *
 * One list per collection drives the form, the parse of a submission, the
 * diff's labels and the order keys are written in (the order the schema and
 * the committed files use, so a proposal's diff is only the fields that
 * changed). Pure and client-safe: no database, no GitHub, no env.
 *
 * `unsettable` marks an optional field: clearing it removes the key and the
 * meeting inherits (from its series). A `nullable` field stores `null` when
 * cleared. The key field (`slug`, `id`) names the item and cannot be edited on
 * an existing one: changing it would make a new meeting or workshop.
 */

export const COLLECTIONS = ["meeting", "workshop", "venue"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const COLLECTION_LABELS: Record<
  Collection,
  { singular: string; plural: string; file: string; key: string }
> = {
  meeting: {
    singular: "meeting",
    plural: "Meetings",
    file: "meetings.json",
    key: "slug",
  },
  workshop: {
    singular: "workshop",
    plural: "Workshops",
    file: "workshops.json",
    key: "id",
  },
  venue: {
    singular: "venue",
    plural: "Venues",
    file: "venues.json",
    key: "id",
  },
};

export function isCollection(value: string): value is Collection {
  return (COLLECTIONS as readonly string[]).includes(value);
}

export type FieldKind =
  "text" | "textarea" | "select" | "datetime" | "number" | "lines" | "agenda";

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  required?: boolean;
  nullable?: boolean;
  unsettable?: boolean;
  isKey?: boolean;
  /** Choices for a select. Series, venue and workshop ids are added at render. */
  options?: readonly { value: string; label: string }[];
  /** Which catalog supplies the options at render time. */
  optionsFrom?: "series" | "venue";
}

const KEY_HELP =
  "Its identity and URL. Fixed once the item exists: changing it would make a new one.";

export const FIELDS: Record<Collection, readonly FieldSpec[]> = {
  meeting: [
    {
      name: "slug",
      label: "Slug",
      kind: "text",
      isKey: true,
      required: true,
      help: `The Eastern date, plus a lowercase descriptor if another meeting shares the day (2026-10-05-judging). ${KEY_HELP}`,
    },
    {
      name: "series",
      label: "Series",
      kind: "select",
      unsettable: true,
      optionsFrom: "series",
      help: "Inherits the series' category, summary, venue and room.",
    },
    {
      name: "title",
      label: "Title",
      kind: "text",
      unsettable: true,
      help: "Leave empty to use the series' title. Required for a one-off.",
    },
    {
      name: "summary",
      label: "Summary",
      kind: "textarea",
      unsettable: true,
      help: "About two sentences. Leave empty to use the series' summary.",
    },
    {
      name: "category",
      label: "Category",
      kind: "select",
      unsettable: true,
      options: MEETING_CATEGORIES.map((value) => ({
        value,
        label: MEETING_CATEGORY_LABELS[value],
      })),
    },
    {
      name: "brand",
      label: "Brand",
      kind: "select",
      unsettable: true,
      options: MEETING_BRANDS.map((value) => ({
        value,
        label:
          value === "devdogs" ? "DevDogs (Cosmic)" : "GDG on Campus (Paper)",
      })),
    },
    {
      name: "venue",
      label: "Venue",
      kind: "select",
      unsettable: true,
      optionsFrom: "venue",
    },
    {
      name: "room",
      label: "Room",
      kind: "text",
      unsettable: true,
      help: 'The room inside the venue, or "TBA".',
    },
    {
      name: "startsAt",
      label: "Starts",
      kind: "datetime",
      required: true,
      help: "Eastern time.",
    },
    {
      name: "endsAt",
      label: "Ends",
      kind: "datetime",
      required: true,
      help: "Eastern time.",
    },
    {
      name: "rsvpUrl",
      label: "RSVP link",
      kind: "text",
      nullable: true,
      help: "An HTTPS event page. Empty for none.",
    },
    {
      name: "cancelledAt",
      label: "Cancelled at",
      kind: "datetime",
      nullable: true,
      help: "Set this (and a reason) to propose cancelling the meeting.",
    },
    {
      name: "cancellationReason",
      label: "Cancellation reason",
      kind: "text",
      nullable: true,
    },
    {
      name: "surveyUrl",
      label: "Outside survey link",
      kind: "text",
      nullable: true,
    },
    {
      name: "questions",
      label: "Survey questions",
      kind: "lines",
      unsettable: true,
      help: "Ids from questions.json, one per line.",
    },
    {
      name: "agenda",
      label: "Agenda",
      kind: "agenda",
      required: true,
      help: "Workshop ids, one per line. Add ` | text` after an id to replace its description for this night only.",
    },
  ],
  workshop: [
    {
      name: "id",
      label: "Id",
      kind: "text",
      isKey: true,
      required: true,
      help: `Lowercase words joined by hyphens. ${KEY_HELP}`,
    },
    { name: "title", label: "Title", kind: "text", required: true },
    {
      name: "description",
      label: "Description",
      kind: "textarea",
      nullable: true,
    },
    {
      name: "project",
      label: "Recommended project",
      kind: "text",
      nullable: true,
      help: 'In words ("DogDays & DogPack").',
    },
    {
      name: "elHours",
      label: "EL hours",
      kind: "number",
      required: true,
      help: "Quarter hours, up to 8.",
    },
    {
      name: "topics",
      label: "Topics",
      kind: "lines",
      unsettable: true,
      help: "Tags like web or mobile, one per line.",
    },
  ],
  venue: [
    {
      name: "id",
      label: "Id",
      kind: "text",
      isKey: true,
      required: true,
      help: `Lowercase words joined by hyphens. ${KEY_HELP}`,
    },
    {
      name: "kind",
      label: "Kind",
      kind: "select",
      required: true,
      options: VENUE_KINDS.map((value) => ({ value, label: value })),
    },
    { name: "name", label: "Name", kind: "text", required: true },
    {
      name: "shortName",
      label: "Short name",
      kind: "text",
      unsettable: true,
      help: "What prints before a room number.",
    },
    {
      name: "building",
      label: "Campus map building",
      kind: "select",
      unsettable: true,
      options: CAMPUS_BUILDING_CODES.map((value) => ({ value, label: value })),
    },
    {
      name: "address",
      label: "Address",
      kind: "text",
      unsettable: true,
      help: "Required off campus.",
    },
    { name: "locality", label: "Town", kind: "text", unsettable: true },
  ],
};

/** The order keys are written in, for each collection. `verified` rides last. */
export function keyOrder(collection: Collection): string[] {
  const names = FIELDS[collection].map((field) => field.name);
  if (collection === "venue") names.push("verified");
  return names;
}

/** Fields whose `null` in a saved edit means "remove the key". */
export function unsettableFields(collection: Collection): Set<string> {
  return new Set(
    FIELDS[collection].filter((f) => f.unsettable).map((f) => f.name),
  );
}

export function fieldLabel(collection: Collection, name: string): string {
  return (
    FIELDS[collection].find((field) => field.name === name)?.label ??
    (name === "verified" ? "Verified details" : name)
  );
}

// ── Item <-> form text ───────────────────────────────────────────────────────

export type Item = Record<string, unknown>;

function plain(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** The text a form control starts with for one field of an item. */
export function toFormText(field: FieldSpec, item: Item | undefined): string {
  const value = item?.[field.name];
  if (value === undefined || value === null) return "";
  if (field.kind === "datetime") return isoToClubLocal(plain(value));
  if (field.kind === "lines") {
    return Array.isArray(value) ? value.map(plain).join("\n") : "";
  }
  if (field.kind === "agenda") {
    if (!Array.isArray(value)) return "";
    return value
      .map((entry: unknown) =>
        typeof entry === "string"
          ? entry
          : `${plain((entry as Item).workshop)} | ${plain((entry as Item).description)}`,
      )
      .join("\n");
  }
  return plain(value);
}

export interface ParsedItem {
  item: Item;
  errors: string[];
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Turns submitted text back into an item. A field left empty is `undefined`
 * when it is unsettable (the key is dropped), `null` when nullable, and an
 * error when required. Only shape problems are reported here; whether the
 * result is publishable is the events validator's job, run over the whole file.
 */
export function parseItem(
  collection: Collection,
  submitted: Readonly<Record<string, string>>,
): ParsedItem {
  const item: Item = {};
  const errors: string[] = [];
  for (const field of FIELDS[collection]) {
    const raw = (submitted[field.name] ?? "").trim();
    if (raw === "" && field.kind !== "agenda") {
      if (field.required) errors.push(`${field.label} is required.`);
      else if (field.nullable) item[field.name] = null;
      continue;
    }
    if (field.kind === "datetime") {
      const iso = clubLocalToIso(raw);
      if (iso === null) {
        errors.push(`${field.label} is not a valid date and time.`);
      } else {
        item[field.name] = iso;
      }
    } else if (field.kind === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${field.label} must be a number.`);
      } else {
        item[field.name] = n;
      }
    } else if (field.kind === "lines") {
      const list = lines(raw);
      if (list.length > 0) item[field.name] = list;
    } else if (field.kind === "agenda") {
      item[field.name] = lines(raw).map((line) => {
        const bar = line.indexOf("|");
        if (bar === -1) return line;
        const workshop = line.slice(0, bar).trim();
        const description = line.slice(bar + 1).trim();
        return description === "" ? workshop : { workshop, description };
      });
    } else {
      item[field.name] = raw;
    }
  }
  return { item, errors };
}
