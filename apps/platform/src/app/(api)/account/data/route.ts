import { db } from "~/server/db";
import { auditEvents } from "~/server/db/schema";
import { accountDeletionAuditEvent } from "~/server/accountDeletion/audit";
import { buildMemberDataExport } from "~/server/accountData/build";
import { expectSession } from "~/server/auth";
import { consumeRateLimit } from "~/server/rateLimit";

/**
 * GET /account/data: "Download my data" (account-deletion Q6). A JSON file of
 * the signed-in member's own platform rows.
 *
 * The member is whoever the session cookie says; there is no parameter to ask
 * for anyone else's, and an officer's session returns the officer's own rows
 * like any other member's. Always available, including while a deletion is
 * pending. Every download is an audit event (`user.data_exported`).
 *
 * Never cached, and not for another site to read: the response is an
 * attachment, so a cross-site navigation only saves a file the visitor cannot
 * see.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const userId = await expectSession().catch(() => null);
  if (!userId) {
    return Response.json(
      { error: "Sign in to download your data." },
      { status: 401, headers: NO_STORE },
    );
  }

  // A few exports an hour is plenty; each one reads about twenty tables and
  // writes an audit row.
  const allowed = await consumeRateLimit({
    scope: "account:data-export",
    subjectId: userId,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return Response.json(
      {
        error:
          "You've downloaded your data a few times already. Try again in an hour.",
      },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "3600" } },
    );
  }

  const data = await buildMemberDataExport(userId);

  await db.insert(auditEvents).values(
    accountDeletionAuditEvent({
      actorUserId: userId,
      action: "user.data_exported",
      userId,
      metadata: {},
    }),
  );

  const stamp = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="devdogs-my-data-${stamp}.json"`,
    },
  });
}
