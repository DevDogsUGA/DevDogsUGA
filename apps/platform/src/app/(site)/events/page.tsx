import { redirect } from "next/navigation";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";

/**
 * The platform's own events page isn't built yet, so `/events` sends people
 * to the Involvement Network's events tab instead. `redirect()` answers with
 * a 307, deliberately: a permanent redirect would be memorized by browsers
 * that visited during this window, and flipping `/events` back to the
 * platform's own page would have no way to reach them.
 */
export default function Events(): never {
  redirect(INVOLVEMENT_NETWORK_EVENTS_URL);
}
