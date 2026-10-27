import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EVENT_FORMATS } from "@devdogsuga/sdk/brand";
import ConsoleShell from "~/components/Console/ConsoleShell";
import GraphicTile from "~/components/Graphics/GraphicTile";
import ZipForm from "~/components/Graphics/ZipForm";
import { formatEventSpan } from "~/lib/eventTime";
import { MAX_PICKS, pickValue } from "~/lib/graphics/picks";
import { canUserUseGraphics } from "~/server/graphics/access";
import { getGraphicsMeeting } from "~/server/graphics/meeting";
import {
  formatOf,
  outputSize,
  renderableOnWorker,
} from "~/server/graphics/render";
import { requirePermission } from "~/server/auth/require";
import { PageHeading } from "~/ui/app-shell";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";

export const metadata: Metadata = {
  title: "Graphics | Meetings | Console | DevDogs",
  robots: { index: false },
};

/**
 * Every graphic for one meeting: the night, then each workshop on it, each at
 * every size, with individual downloads and a ZIP of whatever is ticked.
 *
 * Open to any officer, not only attendance managers (see `canUserUseGraphics`).
 *
 * Personal revisions (C2) are not built. When they are, the loader takes the
 * officer's saved fields (`getGraphicsMeeting(id, revision)`), and the tile
 * URLs carry a `source` the image route resolves the same way, under a "use my
 * saved edits / show official" toggle in the heading. Nothing here assumes the
 * card shows official text only.
 */
export default async function MeetingGraphicsPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  await requirePermission(canUserUseGraphics);
  const { meetingId } = await params;
  const meeting = await getGraphicsMeeting(meetingId);
  if (!meeting) notFound();

  const formats = EVENT_FORMATS.map((name) => formatOf(name)!).filter(
    renderableOnWorker,
  );
  const base = `/console/graphics/meetings/${meeting.id}`;

  return (
    <ConsoleShell current="/console/attendance">
      <PageHeading
        crumbs={[
          { label: "Meetings", href: "/console/attendance" },
          { label: meeting.title },
        ]}
        title="Graphics"
        description={`${meeting.title} · ${formatEventSpan(meeting.startsAt, meeting.endsAt)}`}
      />

      {meeting.cancelled ? (
        <Callout tone="warning" title="This meeting is canceled">
          Its graphics say so and carry no time or room. There are no workshop
          graphics for a canceled night.
        </Callout>
      ) : null}

      <ZipForm action={`${base}/zip`} max={MAX_PICKS}>
        {meeting.subjects.map((subject) => (
          <section
            key={subject.id}
            className="gfx-subject"
            aria-labelledby={`gfx-${subject.id}`}
          >
            <h2 id={`gfx-${subject.id}`}>
              {subject.kind === "meeting"
                ? `Whole meeting · ${subject.label}`
                : `Workshop · ${subject.label}`}
            </h2>
            <div className="gfx-grid">
              {formats.map((format) => {
                const { width, height } = outputSize(format);
                const label = `${subject.label}, ${format.name}`;

                return (
                  <GraphicTile
                    key={format.name}
                    src={`${base}/image?subject=${encodeURIComponent(subject.id)}&format=${format.name}`}
                    alt={label}
                    name={format.name}
                    width={width}
                    height={height}
                    filename={`${subject.stem}-${format.name}.png`}
                    select={
                      <Checkbox
                        name="pick"
                        value={pickValue({
                          subject: subject.id,
                          format: format.name,
                        })}
                        aria-label={`Include ${label} in the ZIP`}
                        label="ZIP"
                      />
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </ZipForm>
    </ConsoleShell>
  );
}
