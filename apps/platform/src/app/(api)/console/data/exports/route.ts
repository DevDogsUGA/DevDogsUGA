import { isOwnScript } from "~/lib/isOwnScript";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { exportDeps } from "~/server/exports/deps";
import { prepareExport } from "~/server/exports/run";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST /console/data/exports: the console Exports page's one step. Audits the
 * export, reads it and returns the files with the counts and the report of who
 * was left out. A route handler (not a server action) so a cross-site POST is
 * refused before anything runs.
 *
 * `canManageAttendance` is re-checked here: the page's gate does not protect
 * an endpoint. Same-origin only, since a cookie-authenticated POST must not be
 * reachable from another site.
 */
export async function POST(request: Request) {
  if (!isOwnScript(request) || request.headers.get("Sec-Fetch-Site") === null) {
    return json({ kind: "error", message: "That request was refused." }, 403);
  }
  const userId = await expectSession().catch(() => null);
  if (!userId || !(await canUserManageAttendance(userId))) {
    return json(
      {
        kind: "error",
        message: "Not authorized: canManageAttendance required.",
      },
      403,
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ kind: "error", message: "That request was not valid." }, 400);
  }
  return json(await prepareExport(body, userId, exportDeps));
}
