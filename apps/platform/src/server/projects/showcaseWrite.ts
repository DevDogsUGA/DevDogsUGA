import "server-only";
import { eq } from "drizzle-orm";
import { ExpectedFailure } from "~/lib/actionResult";
import { rules, type Caller } from "~/server/auth/access";
import { db } from "~/server/db";
import { auditEvents, projects } from "~/server/db/schema";
import { parseShowcaseInput } from "./showcasePolicy";

/**
 * An officer's edit to a Project's showcase fields: the two toggles that put it
 * on the homepage and in the switcher, its place in line, and how it describes
 * itself there (`~/server/projects/showcase`). Taking the Caller the action
 * already authorized, it still checks the rule itself, refuses with
 * `ExpectedFailure`, and writes the change and its audit event in one
 * transaction, so there is never a change the log does not show.
 *
 * Not here, on purpose: the name, description and tags (the Project's owners
 * edit those, and they carry their own limits) and everything about docs.
 */

export type ShowcaseChange = { from: unknown; to: unknown };

/**
 * Applies the fields given, and returns the ones that actually changed, each
 * with its old and new value. A call that changes nothing writes nothing: no
 * `updatedAt` bump and no audit row.
 */
export async function updateProjectShowcase(
  caller: Caller,
  projectId: string,
  input: unknown,
): Promise<{ changes: Record<string, ShowcaseChange> }> {
  if (!rules.officer(caller))
    throw new ExpectedFailure("Only officers can change the showcase.");
  const parsed = parseShowcaseInput(input);
  if (!parsed.ok)
    throw new ExpectedFailure(
      "Check the highlighted fields.",
      parsed.fieldErrors,
    );

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!current) throw new ExpectedFailure("That project was not found.");

    const changes: Record<string, ShowcaseChange> = {};
    const set: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(parsed.values)) {
      if (value === undefined) continue;
      const before = current[field as keyof typeof current];
      if (before === value) continue;
      changes[field] = { from: before, to: value };
      set[field] = value;
    }
    if (Object.keys(changes).length === 0) return { changes };

    await tx
      .update(projects)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: caller.userId,
      source: "platform",
      action: "project.showcase_changed",
      targetType: "project",
      targetId: projectId,
      metadata: { name: current.name, changes },
    });
    return { changes };
  });
}
