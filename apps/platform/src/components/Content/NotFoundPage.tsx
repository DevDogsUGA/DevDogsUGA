import { CalendarIcon, HouseIcon } from "@phosphor-icons/react/ssr";

import LinkButton from "~/ui/link-button";

import "./content.css";

/**
 * The site-wide 404 (`404.html`): the mascot peeking out, a headline, two ways
 * back. Rendered by `app/not-found.tsx` for an unmatched URL and by
 * `(site)/not-found.tsx` for `notFound()` thrown inside a page, so the chrome
 * is the same either way. A signed-out visitor to
 * the console gets this page too; a signed-in member without access gets the
 * denied card instead.
 */
export default function NotFoundPage() {
  return (
    <section className="content-nf">
      <div className="wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cosmic/a/mascot-peek.png" alt="" />
        <div className="eyebrow k">404</div>
        <h1 className="display">That page wandered off.</h1>
        <p>
          The link may be old, or the page may have moved. Meetings are on
          Mondays and Wednesdays.
        </p>
        <div className="content-nf-actions">
          <span className="btn-shadow">
            <LinkButton href="/" variant="default">
              <HouseIcon weight="bold" aria-hidden /> Home
            </LinkButton>
          </span>
          <LinkButton href="/events" variant="secondary">
            <CalendarIcon weight="bold" aria-hidden /> Events
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
