import { z } from "zod";
import {
  SERIES_ID_PATTERN,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  type Workshop,
} from "./schema.js";

/**
 * A workshop definition: a reusable session authored once in `workshops.json`
 * and run on as many nights as it is repeated. A meeting's agenda lists
 * workshop ids, so the same workshop on two nights is one identity (the
 * reflection, streak and EL credit that follow it read that identity, not a
 * title).
 */

/** The most EL (experiential learning) hours one workshop can carry. */
export const WORKSHOP_EL_HOURS_MAX = 8;

/** The EL allowance a workshop carries unless it says otherwise. */
export const WORKSHOP_EL_HOURS_DEFAULT = 1;

export const workshopDefinitionSchema = z.strictObject({
  id: z.string().regex(SERIES_ID_PATTERN).meta({
    description:
      "The workshop's identity; meeting agendas reference it. Changing it makes a new workshop.",
  }),
  title: z.string().min(1).max(WORKSHOP_TITLE_MAX_LENGTH).meta({
    description:
      "One schedule row's worth. Also what a night's title is derived from.",
  }),
  description: z
    .string()
    .max(WORKSHOP_DESCRIPTION_MAX_LENGTH)
    .nullable()
    .meta({ description: "Shown in the meeting's detail dialog." }),
  project: z.string().min(1).nullable().meta({
    description: 'The work it recommends, in words ("DogDays & DogPack").',
  }),
  elHours: z
    .number()
    .positive()
    // Quarter hours: the column is numeric(4,2), and a value it would round
    // to 0 would fail its check and abort the whole reconcile.
    .multipleOf(0.25)
    .max(WORKSHOP_EL_HOURS_MAX)
    .default(WORKSHOP_EL_HOURS_DEFAULT)
    .meta({
      description:
        "EL hours attending earns, independent of the meeting's start and end. Defaults to one hour.",
    }),
  topics: z.array(z.string().regex(SERIES_ID_PATTERN)).optional().meta({
    description: 'Optional topic tags ("web", "mobile", "databases").',
  }),
});

export type WorkshopDefinition = z.infer<typeof workshopDefinitionSchema>;

export const workshopsConfigSchema = z.strictObject({
  /** The editor's pointer to `workshops.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  workshops: z.array(workshopDefinitionSchema),
});

export type WorkshopsConfig = z.infer<typeof workshopsConfigSchema>;

/** A workshop as one night runs it: the definition, plus that night's words. */
export interface ResolvedWorkshop extends Workshop {
  /** The definition's id. */
  id: string;
  elHours: number;
  topics: string[];
}
