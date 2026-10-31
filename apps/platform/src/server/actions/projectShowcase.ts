"use server";

import { z } from "zod";
import { expected, failure, type ActionResult } from "~/lib/actionResult";
import { authorize, rules } from "~/server/auth/access";
import { revalidateShowcase } from "~/server/projects/showcase";
import type { ShowcaseInput } from "~/server/projects/showcasePolicy";
import { updateProjectShowcase } from "~/server/projects/showcaseWrite";

/**
 * The showcase action. An officer puts a Project on the homepage and in the app
 * switcher, orders it, and words how it appears there (Q30). The rules, the
 * limits and the audit event are in `server/projects/showcaseWrite.ts`; this
 * authorizes, names the outcome and refreshes the three surfaces that read it.
 */

/**
 * Sets the showcase fields given on one Project, leaving the rest. Absent
 * fields are untouched; a blank or `null` clears a text field. Icons and colors
 * are registry keys (`~/config/showcaseKeys`), never markup, and links are
 * `https://` or a path on this site.
 */
export async function setProjectShowcase(
  projectId: string,
  input: ShowcaseInput,
): Promise<ActionResult> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  if (!z.string().uuid().safeParse(projectId).success)
    return failure("That project was not found.");

  const result = await expected(() =>
    updateProjectShowcase(access.caller, projectId, input),
  );
  if (!result.ok) return result;

  const changed = Object.keys(result.data!.changes).length;
  if (changed === 0) return { ok: true, message: "Nothing to change." };
  revalidateShowcase();
  return { ok: true, message: "Showcase updated." };
}
