import { isOwnScript } from "~/lib/isOwnScript";
import { meetingTitle } from "~/lib/meetingTitle";
import { getAttendanceMeetings } from "~/server/attendance/getMeetings";

/**
 * The meeting running right now, for the "Check in now" banner. Site pages are
 * cached HTML, so the banner fetches this after hydration instead of the
 * layout reading the database. Public and the same for everyone, so it gets a
 * short shared cache; a meeting that starts or ends shows up within a minute.
 *
 * Only for the site's own scripts, like `/me` (see `isOwnScript`). The
 * `/attendance` prefix is already disallowed in robots.txt.
 */
export const dynamic = "force-dynamic";

export type OngoingMeetingResponse = {
  meeting: { id: string; title: string } | null;
};

export async function GET(request: Request) {
  if (!isOwnScript(request)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const ongoing = (await getAttendanceMeetings()).find((item) => item.ongoing);
  const body: OngoingMeetingResponse = {
    meeting: ongoing ? { id: ongoing.id, title: meetingTitle(ongoing) } : null,
  };
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=30",
      Vary: "Sec-Fetch-Mode, Sec-Fetch-Dest, Sec-Fetch-Site",
    },
  });
}
