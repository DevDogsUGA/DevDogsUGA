/**
 * Member-submitted hackathons and the officer's decision on them (Q26).
 *
 * A Hackathon on a platform other than Devpost is entered by a member as
 * `source='other'`, `approval='pending'`, and an officer approves or declines
 * it. Both functions take the Caller the action already authorized and
 * refuse with `ExpectedFailure`; the actions turn that into an Action result.
 * Devpost's own hackathons never come through here: the sync approves them.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ExpectedFailure } from "~/lib/actionResult";
import { rules, type Caller } from "~/server/auth/access";
import { db } from "~/server/db";
import { auditEvents, hackathons } from "~/server/db/schema";
import { consumeRateLimit } from "~/server/rateLimit";
import { canonicalHttpsUrl } from "./url";

export const NAME_MIN = 2;
export const NAME_MAX = 200;
/** Hackathons one member may submit per day. */
const SUBMISSIONS_PER_DAY = 10;

export type HackathonInput = {
  url: string;
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
};

/**
 * `created`: a new submission, waiting for an officer. `exists`: the link was
 * already on file; `approval` says where it stands, and `linkable` whether
 * this member can see its entry on the page (an approved one, their own, or
 * any to an officer).
 */
export type SubmitOutcome =
  | { status: "created"; id: string }
  | {
      status: "exists";
      id: string;
      approval: "pending" | "approved";
      linkable: boolean;
    };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
/** A real calendar day as the date input writes it (`2026-02-30` is not one). */
function isDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [year, month, date] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date
  );
}

/** Normalizes the form's day inputs: a blank is no date. */
function day(
  value: string | null | undefined,
  field: string,
  errors: Record<string, string>,
): string | null {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (!isDay(text)) errors[field] = "Use a real date.";
  return text;
}

/**
 * Submits a hackathon for an officer to approve. The link is canonicalized and
 * is the identity: a link already on file (Devpost's or another member's) is
 * reported, not duplicated. Validation comes before the rate limit, so a typo
 * costs nothing, and the rate limit before the write.
 */
export async function submitHackathon(
  caller: Caller,
  input: HackathonInput,
): Promise<SubmitOutcome> {
  const errors: Record<string, string> = {};
  const name = input.name.trim().replace(/\s+/gu, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    errors.name = `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  const url = canonicalHttpsUrl(input.url);
  if (url === null) errors.url = "Enter the hackathon's web address (https).";
  const startsOn = day(input.startsOn, "startsOn", errors);
  const endsOn = day(input.endsOn, "endsOn", errors);
  if (startsOn && endsOn && startsOn > endsOn)
    errors.endsOn = "The end can't be before the start.";
  if (Object.keys(errors).length > 0 || url === null)
    throw new ExpectedFailure("Check the highlighted fields.", errors);

  const existing = await onFile(url);
  if (existing) return exists(caller, existing);

  if (
    !(await consumeRateLimit({
      scope: "hackathons:submit",
      subjectId: caller.userId,
      limit: SUBMISSIONS_PER_DAY,
      windowSeconds: 86_400,
    }))
  )
    throw new ExpectedFailure(
      "You've submitted a lot today. Try again tomorrow.",
    );

  // Someone may have submitted the same link since the check above: the
  // unique `url` decides, and the loser is told it exists.
  const [created] = await db
    .insert(hackathons)
    .values({
      source: "other",
      approval: "pending",
      url,
      name,
      location: "",
      startsOn,
      endsOn,
      submittedBy: caller.userId,
    })
    .onConflictDoNothing({ target: hackathons.url })
    .returning({ id: hackathons.id });
  if (created) return { status: "created", id: created.id };
  const raced = await onFile(url);
  if (!raced) throw new ExpectedFailure("Try that again.");
  return exists(caller, raced);
}

type OnFile = { id: string; approval: string; submittedBy: string | null };

async function onFile(url: string): Promise<OnFile | undefined> {
  const [row] = await db
    .select({
      id: hackathons.id,
      approval: hackathons.approval,
      submittedBy: hackathons.submittedBy,
    })
    .from(hackathons)
    .where(eq(hackathons.url, url));
  return row;
}

function exists(caller: Caller, row: OnFile): SubmitOutcome {
  if (row.approval === "declined")
    throw new ExpectedFailure("That hackathon was reviewed and declined.");
  const approval = row.approval === "approved" ? "approved" : "pending";
  return {
    status: "exists",
    id: row.id,
    approval,
    linkable:
      approval === "approved" ||
      row.submittedBy === caller.userId ||
      rules.officer(caller),
  };
}

/**
 * An officer's decision on a pending submission. Only a pending `other`
 * hackathon can be decided, once: the write is conditional on that, so two
 * officers (or a double click) cannot both decide. The decision and its audit
 * event share a transaction. A decline records no approver; the audit event
 * names the officer either way.
 */
export async function decideHackathon(
  caller: Caller,
  id: string,
  decision: "approved" | "declined",
): Promise<{ name: string }> {
  if (!rules.officer(caller))
    throw new ExpectedFailure("Only officers can decide on hackathons.");
  return db.transaction(async (tx) => {
    const [decided] = await tx
      .update(hackathons)
      .set({
        approval: decision,
        approvedBy: decision === "approved" ? caller.userId : null,
        decidedAt: sql`now()`,
      })
      .where(
        and(
          eq(hackathons.id, id),
          eq(hackathons.source, "other"),
          eq(hackathons.approval, "pending"),
        ),
      )
      .returning({
        name: hackathons.name,
        url: hackathons.url,
        submittedBy: hackathons.submittedBy,
      });
    if (!decided)
      throw new ExpectedFailure("That hackathon was already decided.");
    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: caller.userId,
      source: "platform",
      action:
        decision === "approved" ? "hackathon.approved" : "hackathon.declined",
      targetType: "hackathon",
      targetId: id,
      metadata: {
        name: decided.name,
        url: decided.url,
        submittedBy: decided.submittedBy,
      },
    });
    return { name: decided.name };
  });
}
