import { z } from "zod";
import { SHOWCASE_COLOR_KEYS, SHOWCASE_ICON_KEYS } from "~/config/showcaseKeys";

/**
 * What an officer may write to a Project's showcase fields, and the one place
 * that says so. The limits are the `projects` table's own CHECKs
 * (`supabase/schemas/platform/tables/projects.sql`); this refuses first, with a
 * message for the field, so a bad value never reaches a constraint violation.
 *
 * Pure: no database, no session, no `next/cache`, so the form that edits these
 * fields can import {@link SHOWCASE_LIMITS} for its `maxLength`s.
 */

/** The longest each text field may be, as the table's CHECKs have it. */
export const SHOWCASE_LIMITS = {
  tagline: 160,
  yearLabel: 40,
  note: 280,
  showcaseLabel: 80,
  liveLabel: 80,
  switcherBlurb: 80,
  url: 2048,
} as const;

/** The most the display order may be moved off 0 in either direction. */
export const DISPLAY_ORDER_LIMIT = 10_000;

const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f\u007f]/u;
const SITE_PATH = /^\/(?:[^/]|$)/u;

/**
 * Whether a link may sit behind a showcase button: `https://` to a host, or a
 * path on this site. Anything else is refused: `javascript:` and `data:` run
 * script, `http:` downgrades, `//host` and `/\host` are protocol-relative to a
 * browser and so leave the site while looking like a path, and embedded
 * credentials, whitespace and control characters have no honest use in a link.
 * The database CHECK is the looser backstop (`https://` or a single-slash path).
 */
export function isShowcaseUrl(value: string): boolean {
  if (value.length > SHOWCASE_LIMITS.url || UNSAFE_CHARACTERS.test(value))
    return false;
  if (SITE_PATH.test(value)) return true;
  if (!value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** A blank is "no value": the field is cleared, not stored as an empty string. */
function blankIsNull(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function text(max: number) {
  return z.preprocess(
    blankIsNull,
    z.string().max(max, `Use ${max} characters or fewer.`).nullable(),
  );
}

const url = z.preprocess(
  blankIsNull,
  z
    .string()
    .refine(
      isShowcaseUrl,
      "Use an https:// address, or a path on this site like /docs.",
    )
    .nullable(),
);

/**
 * The fields {@link setProjectShowcase} takes. Every one is optional: absent
 * leaves the value alone, a blank or `null` clears it. `.strict()` so a field
 * that is not here (`status`, `devdogsOwned`, `docsRepoId`) is refused, not
 * quietly ignored.
 */
export const showcaseInputSchema = z
  .strictObject({
    featured: z.boolean(),
    inSwitcher: z.boolean(),
    displayOrder: z
      .number()
      .int("Use a whole number.")
      .min(-DISPLAY_ORDER_LIMIT, `Use a number from -${DISPLAY_ORDER_LIMIT}.`)
      .max(DISPLAY_ORDER_LIMIT, `Use a number up to ${DISPLAY_ORDER_LIMIT}.`),
    tagline: text(SHOWCASE_LIMITS.tagline),
    yearLabel: text(SHOWCASE_LIMITS.yearLabel),
    note: text(SHOWCASE_LIMITS.note),
    showcaseLabel: text(SHOWCASE_LIMITS.showcaseLabel),
    liveLabel: text(SHOWCASE_LIMITS.liveLabel),
    switcherBlurb: text(SHOWCASE_LIMITS.switcherBlurb),
    liveUrl: url,
    switcherUrl: url,
    // Registry keys only. The error names the vocabulary rather than echoing
    // the rejected value back into a message.
    iconKey: z.preprocess(
      blankIsNull,
      z.enum(SHOWCASE_ICON_KEYS, "Choose one of the listed icons.").nullable(),
    ),
    colorKey: z.preprocess(
      blankIsNull,
      z
        .enum(SHOWCASE_COLOR_KEYS, "Choose one of the listed colors.")
        .nullable(),
    ),
    contributionMode: z.preprocess(
      blankIsNull,
      z.enum(["open", "closed"], "Choose open or closed.").nullable(),
    ),
  })
  .partial();

export type ShowcaseInput = z.input<typeof showcaseInputSchema>;
export type ShowcaseValues = z.output<typeof showcaseInputSchema>;

/**
 * Normalizes and checks an input. Returns the values to write, with blanks
 * turned into `null`, or the message for each field that failed.
 */
export function parseShowcaseInput(
  input: unknown,
):
  | { ok: true; values: ShowcaseValues }
  | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = showcaseInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    // An unrecognized key reports at the object, with the key in `keys`.
    const field =
      issue.code === "unrecognized_keys"
        ? (issue.keys[0] ?? "input")
        : String(issue.path[0] ?? "input");
    fieldErrors[field] ??=
      issue.code === "unrecognized_keys"
        ? "That field cannot be changed here."
        : issue.message;
  }
  return { ok: false, fieldErrors };
}
