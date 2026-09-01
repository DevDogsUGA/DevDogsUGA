import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { academicPrograms } from "~/server/db/schema";
import { scrapeBulletinPrograms } from "./bulletin";

const UPSERT_BATCH_SIZE = 200;

export interface AcademicProgramSyncReport {
  programs: number;
  pages: number;
  requests: number;
  retries: number;
  syncedAt: string;
}

export async function syncAcademicPrograms(): Promise<AcademicProgramSyncReport> {
  const scrape = await scrapeBulletinPrograms();
  const syncedAt = new Date();

  await db.transaction(async (tx) => {
    // Keep rows referenced by a profile, but stop offering anything the latest
    // complete scrape did not contain. The transaction rolls this back if any
    // upsert fails.
    await tx
      .update(academicPrograms)
      .set({ active: false, updatedAt: syncedAt });

    for (
      let offset = 0;
      offset < scrape.programs.length;
      offset += UPSERT_BATCH_SIZE
    ) {
      const batch = scrape.programs.slice(offset, offset + UPSERT_BATCH_SIZE);
      await tx
        .insert(academicPrograms)
        .values(
          batch.map((program) => ({
            ...program,
            active: true,
            lastSeenAt: syncedAt,
            updatedAt: syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: academicPrograms.id,
          set: {
            name: sql`excluded."name"`,
            credential: sql`excluded."credential"`,
            category: sql`excluded."category"`,
            schoolCode: sql`excluded."schoolCode"`,
            bulletinUrl: sql`excluded."bulletinUrl"`,
            active: true,
            lastSeenAt: syncedAt,
            updatedAt: syncedAt,
          },
        });
    }
  });

  console.info("academic_program_sync_succeeded", {
    programs: scrape.programs.length,
    pages: scrape.pages,
    requests: scrape.requests,
    retries: scrape.retries,
    syncedAt: syncedAt.toISOString(),
  });

  return {
    programs: scrape.programs.length,
    pages: scrape.pages,
    requests: scrape.requests,
    retries: scrape.retries,
    syncedAt: syncedAt.toISOString(),
  };
}
