import { notFound } from "next/navigation";
import { EVENT_FORMATS } from "@devdogsuga/sdk/brand";
import { parsePicks } from "~/lib/graphics/picks";
import { zipStream, type ZipFile } from "~/lib/graphics/zip";
import { canUserUseGraphics } from "~/server/graphics/access";
import { getGraphicsMeeting } from "~/server/graphics/meeting";
import {
  formatOf,
  renderMeetingGraphic,
  renderableOnWorker,
} from "~/server/graphics/render";
import { badRequest } from "~/server/graphics/respond";
import { requirePermission } from "~/server/auth/require";

/**
 * A ZIP of the graphics an officer ticked: `?pick=<subject>@<format>`, repeated.
 *
 * The archive streams. Each PNG is drawn when the stream is read, written, and
 * dropped before the next is drawn, so the Worker holds one image at a time and
 * the first file reaches the browser while the rest are still rendering. See
 * `~/lib/graphics/zip`.
 *
 * Everything is validated before the first byte is sent, because once a
 * download has started its status can no longer change.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  await requirePermission(canUserUseGraphics);
  const { meetingId } = await params;

  const meeting = await getGraphicsMeeting(meetingId);
  if (!meeting) notFound();

  const result = parsePicks(new URL(request.url).searchParams.getAll("pick"), {
    subjects: meeting.subjects.map((subject) => subject.id),
    formats: EVENT_FORMATS.filter((name) =>
      renderableOnWorker(formatOf(name)!),
    ),
  });
  if (!result.ok) return badRequest(result.reason);

  const bySubject = new Map(
    meeting.subjects.map((subject) => [subject.id, subject]),
  );

  async function* files(): AsyncGenerator<ZipFile> {
    for (const pick of result.ok ? result.picks : []) {
      const subject = bySubject.get(pick.subject)!;
      const format = formatOf(pick.format)!;

      yield {
        name: `${subject.stem}-${format.name}.png`,
        data: await renderMeetingGraphic(subject, format),
      };
    }
  }

  return new Response(zipStream(files()), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${meeting.slug}-graphics.zip"`,
      "cache-control": "no-store",
    },
  });
}
