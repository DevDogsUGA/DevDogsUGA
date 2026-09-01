/**
 * Every rule the account page enforces, in one place.
 *
 * The page saves all of its fields at once (see ~/ui/settings-form), which
 * makes a rule the client does not know about expensive: the save fans out,
 * some writes land, one comes back rejected, and the member is left staring at
 * a form that is half saved. So the client has to refuse exactly what the
 * server would refuse, no more and no less, which it can only do if both sides
 * read their rules from the same file.
 *
 * The validators below return a human-readable message or `null`, which is
 * what the fields render on blur. The zod schemas at the bottom are built out
 * of those same validators, so a server action and an input cannot drift: to
 * change a rule you change it here, once.
 *
 * Limits that mirror a database column are marked as such. Those are the ones
 * that used to bite: `profileLinks.title` is `varchar(64)` while the add-link
 * action accepted 100 characters and the input let you type them, so a long
 * title passed validation and then failed at the insert.
 */

import * as z from "zod";
import { normalizeShortText } from "~/lib/shortText";

export const PROFILE_LIMITS = {
  /** Stricter than the `varchar(255)` column on purpose. It is a display name. */
  preferredName: 32,
  /** `platform.profile.bio` is `varchar(127)`. */
  shortText: 127,
  /**
   * `platform.profile.roleDescription` is `varchar(512)`. It shared
   * `shortText` until 20260827000000 widened the column: it is the officer bio
   * the homepage Leadership section prints, and 127 characters could not hold
   * one. Still far short of an essay, because it renders in a hover card, which
   * stops being a card if it grows.
   */
  roleDescription: 512,
  /** Length of a single pronoun, e.g. "theirs". */
  pronounChars: 6,
  pronounCount: 4,
  /** Enough for double degrees plus certificates without making a profile card unbounded. */
  academicProgramCount: 12,
  /** `platform."profileLinks".title` is `varchar(64)`. */
  linkTitle: 64,
  linkCount: 5,
} as const;

export type Semester = "spring" | "summer" | "fall";

export const SEMESTERS = ["spring", "summer", "fall"] as const;

/** The month a semester has finished by, used to reject past graduations. */
const SEMESTER_END_MONTH: Record<Semester, number> = {
  spring: 5,
  summer: 8,
  fall: 12,
};

// ---------------------------------------------------------------------------
// Preferred name
// ---------------------------------------------------------------------------

export function validatePreferredName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Enter a preferred name.";
  if (trimmed.length > PROFILE_LIMITS.preferredName) {
    return `Keep your name to ${PROFILE_LIMITS.preferredName} characters or fewer.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bio and role description
// ---------------------------------------------------------------------------

function validateShortText(value: string, noun: string): string | null {
  const normalized = normalizeShortText(value);
  if (normalized.length > PROFILE_LIMITS.shortText) {
    return `Keep your ${noun} to ${PROFILE_LIMITS.shortText} characters or fewer.`;
  }
  return null;
}

export function validateBio(value: string): string | null {
  return validateShortText(value, "bio");
}

export function validateRoleDescription(value: string): string | null {
  if (/\r|\n/.test(value)) {
    return "Keep your role description on one line.";
  }
  if (/\s{2,}/u.test(value)) {
    return "Use only one space between words in your role description.";
  }
  if (value.trim().length > PROFILE_LIMITS.roleDescription) {
    return `Keep your role description to ${PROFILE_LIMITS.roleDescription} characters or fewer.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pronouns
// ---------------------------------------------------------------------------

export function validatePronouns(values: string[]): string | null {
  if (values.length > PROFILE_LIMITS.pronounCount) {
    return `Add at most ${PROFILE_LIMITS.pronounCount} pronouns.`;
  }
  if (values.some((p) => p.trim().length === 0)) {
    return "Pronouns can't be blank.";
  }
  if (values.some((p) => p.length > PROFILE_LIMITS.pronounChars)) {
    return `Each pronoun must be ${PROFILE_LIMITS.pronounChars} characters or fewer.`;
  }
  if (new Set(values).size !== values.length) {
    return "Remove the duplicate pronoun.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Academic programs
// ---------------------------------------------------------------------------

export function validateAcademicProgramIds(values: number[]): string | null {
  if (values.length > PROFILE_LIMITS.academicProgramCount) {
    return `Add at most ${PROFILE_LIMITS.academicProgramCount} programs.`;
  }
  if (values.some((id) => !Number.isInteger(id) || id < 1)) {
    return "Select programs from the UGA Bulletin list.";
  }
  if (new Set(values).size !== values.length) {
    return "Remove the duplicate program.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Graduation
//
// Semester and year are one value split across two selects, so they are
// validated together. `now` is a parameter rather than a `new Date()` inside
// the function so the server, the client, and the tests can all agree on when
// "in the past" is being measured from.
// ---------------------------------------------------------------------------

export function isGraduationInPast(
  semester: Semester,
  year: number,
  now: Date = new Date(),
): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return true;
  if (year > currentYear) return false;
  return SEMESTER_END_MONTH[semester] <= currentMonth;
}

export function validateGraduation(
  semester: Semester | "" | null,
  year: number | null,
  now: Date = new Date(),
): string | null {
  const hasSemester = Boolean(semester);
  const hasYear = year !== null && !Number.isNaN(year);

  // Clearing the date entirely is allowed; setting half of it is not.
  if (hasSemester !== hasYear) {
    return "Pick both a semester and a year.";
  }
  if (!hasSemester || !hasYear) return null;
  if (isGraduationInPast(semester as Semester, year, now)) {
    return "Your graduation date must be in the future.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * `new URL()` accepts every scheme there is, `javascript:` and `data:` and
 * `mailto:` included, so parsing alone is not the check. The add-link action
 * refuses anything that is not http(s), and this has to refuse the same set.
 */
export function isValidLinkUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function validateLinkUrl(url: string): string | null {
  if (url.trim().length === 0) return "Enter a link URL.";
  if (!isValidLinkUrl(url)) return "Enter a full http:// or https:// URL.";
  return null;
}

export function validateLinkTitle(title: string): string | null {
  if (title.length > PROFILE_LIMITS.linkTitle) {
    return `Keep the title to ${PROFILE_LIMITS.linkTitle} characters or fewer.`;
  }
  return null;
}

/** Validates the whole staged list, which is what the page-wide save commits. */
export function validateLinks(
  links: { url: string; title?: string | null }[],
): string | null {
  if (links.length > PROFILE_LIMITS.linkCount) {
    return `You can only add up to ${PROFILE_LIMITS.linkCount} links.`;
  }
  for (const link of links) {
    const urlError = validateLinkUrl(link.url);
    if (urlError) return urlError;
    const titleError = validateLinkTitle(link.title ?? "");
    if (titleError) return titleError;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server-side schemas
//
// Thin wrappers over the validators above: a `superRefine` carrying the
// validator's own message, so there is exactly one statement of each rule. A
// server action gets zod's parsing and error shape; the client gets a string.
// ---------------------------------------------------------------------------

/** Turns a `(value) => string | null` validator into a zod refinement. */
function refined<T>(
  schema: z.ZodType<T>,
  validate: (value: T) => string | null,
) {
  return schema.superRefine((value, ctx) => {
    const message = validate(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });
}

export const preferredNameSchema = refined(z.string(), validatePreferredName);
export const bioSchema = refined(z.string(), validateBio);
export const roleDescriptionSchema = refined(
  z.string(),
  validateRoleDescription,
);
export const pronounsSchema = refined(z.array(z.string()), validatePronouns);
export const academicProgramIdsSchema = refined(
  z.array(z.number()),
  validateAcademicProgramIds,
);
export const linkTitleSchema = refined(z.string(), validateLinkTitle);
export const linkUrlSchema = refined(z.string(), validateLinkUrl);

export const graduationSchema = z
  .object({
    semester: z.enum(SEMESTERS).nullable(),
    year: z.number().int().nullable(),
  })
  .superRefine((value, ctx) => {
    const message = validateGraduation(value.semester, value.year);
    if (message) ctx.addIssue({ code: "custom", message });
  });
