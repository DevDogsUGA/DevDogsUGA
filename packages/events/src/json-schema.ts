import { z } from "zod";
import { questionsConfigSchema } from "./questions.js";
import { clubConfigSchema } from "./schema.js";
import { seriesConfigSchema } from "./series.js";

/**
 * JSON Schemas for the data files, generated from the zod schemas that
 * validate them, so an officer's editor completes and checks `meetings.json`
 * and `questions.json` through each file's `$schema` key with the same rules
 * CI applies (lengths, choices, id patterns). What JSON Schema cannot say --
 * endsAt after startsAt, a listed question existing -- stays CI's alone.
 *
 * Committed beside the data (`data/*.schema.json`) and regenerated with
 * `pnpm --filter @devdogsuga/events codegen`; a test fails when they drift.
 */
export function jsonSchemas(): Record<string, unknown> {
  const generate = (schema: z.ZodType, title: string, description: string) => ({
    ...z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
    title,
    description,
  });
  return {
    "meetings.schema.json": generate(
      clubConfigSchema,
      "DevDogs meetings",
      "The club's meetings and their workshops (Backstage packages/events).",
    ),
    "series.schema.json": generate(
      seriesConfigSchema,
      "DevDogs meeting series",
      "The recurring kinds of night meetings reference by id (Backstage packages/events).",
    ),
    "questions.schema.json": generate(
      questionsConfigSchema,
      "DevDogs check-in survey questions",
      "Questions the check-in survey asks (Backstage packages/events).",
    ),
  };
}

/** A file's text before `schemas` hands it to Prettier. */
export function schemaText(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
