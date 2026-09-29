import { and, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { supportGuests, supportMessages } from "~/server/db/schema";
import { GUEST_RETENTION_DAYS } from "./config";

/**
 * Deletes guests idle past the retention window. Their conversation rows go
 * with them (cascade); the Discord posts stay, since Discord is the record.
 * Relayed-message rows lose their guest (set null) and, owned by nobody,
 * are deleted too: they only exist to say whose a message was.
 */
export async function expireGuests(): Promise<number> {
  const expired = await db
    .delete(supportGuests)
    .where(
      lt(
        supportGuests.lastSeenAt,
        sql`now() - make_interval(days => ${GUEST_RETENTION_DAYS})`,
      ),
    )
    .returning({ id: supportGuests.id });
  await db
    .delete(supportMessages)
    .where(and(isNull(supportMessages.userId), isNull(supportMessages.guestId)));
  return expired.length;
}
