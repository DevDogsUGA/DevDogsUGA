import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { Band } from "~/ui/band";
import LinkButton from "~/ui/link-button";
import LeaderCluster from "./LeaderCluster";
import { getCurrentOfficers } from "~/server/loaders/officers";
import { LEADERSHIP_BLURB } from "~/components/homeCopy";

/**
 * The officers as a fan of helmets on the starfield, then the standing note
 * about applying. A band, so the sky behind it is the page's last ground.
 */
export default async function LeadershipSection() {
  // Cached in the loader, and this whole section renders inside the
  // homepage's `"use cache"` scope, so the await does not make the page
  // dynamic. It resolves when the prerendered shell is built, and again
  // whenever a board edit or the loader's TTL revalidates it.
  const officers = await getCurrentOfficers();

  return (
    <Band id="leadership" className="section home-lsec scroll-mt-20">
      <div className="wrap">
        <div className="home-lhead">
          <h2 id="leadership-heading">Leadership</h2>
          <p className="muted">{LEADERSHIP_BLURB}</p>
        </div>

        {/* An empty board is a fresh database, not a state worth designing
            for. But rendering the cluster with nothing in it produces a 660px
            void under the heading, so the section closes up instead. */}
        {officers.length > 0 && <LeaderCluster profiles={officers} />}

        {/* Says the same thing as the announcement notice, in the same words,
            behind the same button. The notice is dismissible and scoped to a
            session; this is the standing copy that outlives it, so the two
            have to agree. See ~/config/announcement.ts. */}
        <div className="home-lfoot">
          <p className="small muted">
            DevDogs leadership is elected each spring semester. Applications for
            the spring team open late in the fall semester.
          </p>
          <LinkButton
            href="/leadership"
            // A next.config redirect onto the application form, not a page, so
            // never prefetch. It leaves the site, so it leaves this tab alone.
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            Apply
            <ArrowUpRightIcon weight="bold" />
          </LinkButton>
        </div>
      </div>
    </Band>
  );
}
