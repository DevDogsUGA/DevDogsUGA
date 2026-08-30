import { redirect } from "next/navigation";
import { INVOLVEMENT_NETWORK_URL } from "~/config/nav";

/**
 * `/join` is the club's public "how do I sign up" link. It appears in the hero,
 * the footer, the app switcher, and anywhere we hand the URL out in person. For
 * now it points at the UGA Involvement Network listing, because that roster is
 * what confers membership; a platform account does not.
 *
 * It used to start the Google OAuth handshake instead, via
 * `startOAuthFromLink`, still behind `/auth`. Importing that again here is all
 * it takes to undo this.
 *
 * `redirect()` answers with a 307, deliberately: a permanent redirect would be
 * memorized by browsers that visited during this window, and flipping `/join`
 * back to sign-up would have no way to reach them.
 */
export function GET(): never {
  redirect(INVOLVEMENT_NETWORK_URL);
}
