import { rules, requireAccess } from "~/server/auth/access";
import { notFound } from "next/navigation";
import { EVENT_FORMATS } from "@devdogsuga/sdk/brand";

import { getGraphicsMeeting } from "~/server/graphics/meeting";
import {
  formatOf,
  renderMeetingGraphic,
  renderableOnWorker,
} from "~/server/graphics/render";
import { badRequest, pngResponse } from "~/server/graphics/respond";

/**
 * One meeting graphic as a PNG, drawn on request: the preview's `<img>` and the
 * individual download are this same URL, the download adding `?download=1`.
 *
 * A route handler, not a metadata image, because the officer picks the subject
 * and the size. It takes ids and names from fixed lists, never text, so it
 * cannot draw arbitrary words on the club's branding.
 *
 * Any officer may call it (`rules.useGraphics`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  await requireAccess(rules.useGraphics);
  const { meetingId } = await params;
  const query = new URL(request.url).searchParams;

  const format = formatOf(query.get("format") ?? "");
  if (
    !format ||
    !(EVENT_FORMATS as readonly string[]).includes(format.name) ||
    !renderableOnWorker(format)
  ) {
    return badRequest("Unknown size.");
  }

  const meeting = await getGraphicsMeeting(meetingId);
  if (!meeting) notFound();

  const subject = meeting.subjects.find(
    (candidate) => candidate.id === query.get("subject"),
  );
  if (!subject) return badRequest("Unknown graphic.");

  return pngResponse(
    await renderMeetingGraphic(subject, format),
    `${subject.stem}-${format.name}.png`,
    query.get("download") === "1",
  );
}
