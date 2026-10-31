"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expected, failure, type ActionResult } from "~/lib/actionResult";
import { authorize, authorizeSession, rules } from "~/server/auth/access";
import {
  decideHackathon,
  submitHackathon,
  type SubmitOutcome,
} from "~/server/hackathons/submit";

/**
 * The Hackathons actions. Any member submits one (Q26); an officer approves or
 * declines it. The rules, and the audit event, are in
 * `server/hackathons/submit.ts`; this authorizes, parses and revalidates.
 */

const PAGE = "/dashboard/hackathons";

const submitSchema = z.object({
  url: z.string().max(4096),
  name: z.string().max(1000),
  startsOn: z.string().max(10).optional(),
  endsOn: z.string().max(10).optional(),
});

/**
 * A member submits a hackathon for an officer to approve. A link already on
 * file is not an error: it answers `exists` with where it stands, so the form
 * can point to it.
 */
export async function submitHackathonAction(
  formData: FormData,
): Promise<ActionResult<SubmitOutcome>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("That hackathon is invalid.");
  const result = await expected(() =>
    submitHackathon(access.caller, parsed.data),
  );
  if (!result.ok) return result;
  revalidatePath(PAGE);
  const outcome = result.data!;
  return {
    ok: true,
    data: outcome,
    message:
      outcome.status === "created"
        ? "Hackathon submitted. An officer will review it."
        : outcome.approval === "approved"
          ? "That hackathon is already listed."
          : "That hackathon is already waiting for review.",
  };
}

const decisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
});

/** An officer approves or declines a pending submission. */
export async function decideHackathonAction(
  id: string,
  decision: "approved" | "declined",
): Promise<ActionResult> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  const parsed = decisionSchema.safeParse({ id, decision });
  if (!parsed.success) return failure("That decision is invalid.");
  const result = await expected(async () => {
    const decided = await decideHackathon(
      access.caller,
      parsed.data.id,
      parsed.data.decision,
    );
    return decided.name;
  });
  if (!result.ok) return result;
  revalidatePath(PAGE);
  return {
    ok: true,
    message:
      decision === "approved"
        ? `${result.data!} approved.`
        : `${result.data!} declined.`,
  };
}
