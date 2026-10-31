/**
 * What `/dashboard/hackathons` reads. Members see every approved Hackathon and
 * their own submissions that are not approved (waiting, or declined);
 * officers also see every submission waiting for a decision. Nothing here is
 * public: the page sits behind the dashboard gate.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { hackathons, profiles, projectSyncJobs } from "~/server/db/schema";
import { orderHackathons } from "./present";

const LISTED = {
  id: hackathons.id,
  name: hackathons.name,
  url: hackathons.url,
  location: hackathons.location,
  openState: hackathons.openState,
  dateLabel: hackathons.dateLabel,
  startsOn: hackathons.startsOn,
  endsOn: hackathons.endsOn,
};

/** Approved hackathons read per page load; Devpost's open feed is under a hundred. */
const APPROVED_LIMIT = 500;

export async function getHackathonsPage(userId: string, officer: boolean) {
  const [approved, mine, waiting, [sync]] = await Promise.all([
    db
      .select({ ...LISTED, source: hackathons.source })
      .from(hackathons)
      .where(eq(hackathons.approval, "approved"))
      .limit(APPROVED_LIMIT),
    db
      .select({ ...LISTED, approval: hackathons.approval })
      .from(hackathons)
      .where(
        and(
          eq(hackathons.submittedBy, userId),
          inArray(hackathons.approval, ["pending", "declined"]),
        ),
      )
      .orderBy(desc(hackathons.createdAt)),
    officer
      ? db
          .select({ ...LISTED, submittedByName: profiles.preferredName })
          .from(hackathons)
          .leftJoin(profiles, eq(profiles.userId, hackathons.submittedBy))
          .where(eq(hackathons.approval, "pending"))
          .orderBy(hackathons.createdAt)
      : Promise.resolve([]),
    db
      .select({ at: projectSyncJobs.lastSucceededAt })
      .from(projectSyncJobs)
      .where(eq(projectSyncJobs.job, "devpost-sync")),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...orderHackathons(approved, today),
    mine,
    waiting,
    /** When the Devpost feed last synced to the end, or null if it never has. */
    syncedAt: sync?.at ?? null,
  };
}
