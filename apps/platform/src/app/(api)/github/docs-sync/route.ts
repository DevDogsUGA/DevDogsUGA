import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
import { syncBranch } from "~/server/docs/sync";

// Backfills can ingest a whole repo's docs from scratch.
export const maxDuration = 300;

const bodySchema = z.object({
  repo: z.string(),
  branch: z.string().optional(),
});

/**
 * Manual sync trigger for initial backfills and off-convention branches:
 *   curl -X POST /github/docs-sync \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -d '{"repo":"DevDogs-Website"}'
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const repo = await db.query.docsRepos.findFirst({
    where: { slug: parsed.data.repo },
  });
  if (!repo) {
    return NextResponse.json({ ok: false, error: "unknown-repo" }, { status: 404 });
  }

  const branch = parsed.data.branch ?? repo.defaultBranch;
  const result = await syncBranch(repo.slug, branch);

  return NextResponse.json({ ok: true, repo: repo.slug, branch, ...result });
}
