import { isOwnScript } from "~/lib/isOwnScript";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { importDeps } from "~/server/imports/deps";
import { confirmImport, previewImport } from "~/server/imports/run";
import { readUpload } from "~/server/imports/upload";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST /console/data/imports/preview and /confirm: the console Imports page's
 * two steps. A route handler rather than a server action so the declared size
 * is refused before the body is read, and the upload (a CSV, not JSON) is a
 * plain multipart form. The file is held in memory for the request and never
 * stored (Q73).
 *
 * `canManageAttendance` is re-checked here: the page's gate does not protect
 * an endpoint. Same-origin only, since a cookie-authenticated POST must not be
 * reachable from another site.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string }> },
) {
  const { step } = await params;
  if (step !== "preview" && step !== "confirm") {
    return new Response("Not Found", { status: 404, headers: NO_STORE });
  }
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

  const upload = await readUpload(request);
  if (!upload.ok) {
    return json({ kind: "error", message: upload.message }, upload.status);
  }
  if (step === "preview") {
    return json(await previewImport(upload.request, importDeps));
  }
  if (!upload.confirmation) {
    return json({ kind: "error", message: "That request was not valid." }, 400);
  }
  return json(
    await confirmImport(
      upload.request,
      upload.confirmation,
      userId,
      importDeps,
    ),
  );
}
