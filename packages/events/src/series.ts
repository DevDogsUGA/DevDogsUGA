import { z } from "zod";
import {
  MEETING_BRANDS,
  MEETING_BUILDING_CHOICES,
  MEETING_CATEGORIES,
  MEETING_SUMMARY_MAX_LENGTH,
  SERIES_ID_PATTERN,
} from "./schema.js";

/**
 * A series: a recurring kind of night (Merge Monday, Build Session, Touch
 * Grass) authored once in `series.json`. A meeting names its series by `id`
 * and inherits what it does not set itself, so a new Monday is a few lines
 * and a rename is one edit.
 */

/** A series name fits a title with room for "#12" and a workshop list. */
export const SERIES_NAME_MAX_LENGTH = 48;

export const SERIES_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type SeriesWeekday = (typeof SERIES_WEEKDAYS)[number];

const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be 24-hour "HH:MM"');

export const seriesSchema = z.strictObject({
  id: z.string().regex(SERIES_ID_PATTERN).meta({
    description:
      "The series' identity; meetings reference it. Changing it detaches every meeting that names it.",
  }),
  name: z.string().min(1).max(SERIES_NAME_MAX_LENGTH).meta({
    description: 'What the series is called ("Merge Monday").',
  }),
  category: z.enum(MEETING_CATEGORIES).meta({
    description: "The category every night of the series takes by default.",
  }),
  brand: z.enum(MEETING_BRANDS).meta({
    description: "devdogs (Cosmic) or gdgc (Paper).",
  }),
  headline: z.enum(["series", "topic"]).meta({
    description:
      '"series" leads with the series name (plus #n and the night\'s workshops). "topic" leads with the workshop topic and shows the series name as a small kicker.',
  }),
  numbered: z.boolean().optional().meta({
    description:
      "Append #n to the title, counted per term in date order, skipping cancelled nights.",
  }),
  slot: z
    .strictObject({
      weekday: z.enum(SERIES_WEEKDAYS),
      start: clockTime,
      end: clockTime,
    })
    .optional()
    .meta({
      description:
        "The usual time, Eastern. Documents when the series meets; each meeting still authors its own startsAt and endsAt.",
    }),
  summary: z.string().min(1).max(MEETING_SUMMARY_MAX_LENGTH).optional().meta({
    description: "The summary a night uses when it does not write its own.",
  }),
  building: z.enum(MEETING_BUILDING_CHOICES).nullable().optional(),
  location: z.string().min(1).optional().meta({
    description: "The room a night uses when it does not name one.",
  }),
});

export type Series = z.infer<typeof seriesSchema>;

export const seriesConfigSchema = z.strictObject({
  /** The editor's pointer to `series.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  series: z.array(seriesSchema),
});

export type SeriesConfig = z.infer<typeof seriesConfigSchema>;
