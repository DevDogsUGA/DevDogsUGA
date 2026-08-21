import { redirect } from "next/navigation";
import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";

/**
 * The platform's own community page isn't built yet, so `/community` sends
 * people to the Involvement Network's roster instead. `redirect()` answers
 * with a 307, deliberately: a permanent redirect would be memorized by
 * browsers that visited during this window, and flipping `/community` back
 * to the platform's own page would have no way to reach them.
 */
export default function Community(): never {
  redirect(INVOLVEMENT_NETWORK_ROSTER_URL);
}
