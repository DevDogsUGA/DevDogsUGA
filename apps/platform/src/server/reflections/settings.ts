import { db } from "~/server/db";
import { reflectionSettings } from "~/server/db/schema";

export interface ReflectionSettingsValue {
  minimumWordCount: number;
  submissionWindowDays: number;
}

/** DB defaults from the migration, used only if the singleton row is somehow missing. */
export const DEFAULT_REFLECTION_SETTINGS: ReflectionSettingsValue = {
  minimumWordCount: 100,
  submissionWindowDays: 7,
};

/**
 * The one global row governing EL reflections: how many words a submission
 * needs and how many days after an activity ends members may still submit.
 * `reflections/load.ts` and `server/actions/reflections.ts` each read the same
 * two columns with their own raw SQL (see the comment on `endsAt` decoding
 * there) because they run inside a transaction/lock scope this loader
 * doesn't share; this one is for read-only, non-locking reads such as the
 * officer console settings form.
 */
export async function getReflectionSettings(): Promise<ReflectionSettingsValue> {
  const [row] = await db
    .select({
      minimumWordCount: reflectionSettings.minimumWordCount,
      submissionWindowDays: reflectionSettings.submissionWindowDays,
    })
    .from(reflectionSettings)
    .limit(1);
  return row ?? DEFAULT_REFLECTION_SETTINGS;
}
