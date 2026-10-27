import {
  ArrowLeftIcon,
  HouseIcon,
  SignInIcon,
} from "@phosphor-icons/react/ssr";

import { CONTACT_EMAIL } from "~/config/nav";
import signOut from "~/server/actions/signOut";
import { Button } from "~/ui/button";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";

import "./content.css";

/**
 * The 403 for the console, in the 404's layout. Two cases:
 *
 * - `section` is given: an officer who can use the console but not this part
 *   of it. Says which part, and offers the way back to a section they can use.
 * - `section` is null: a signed-in member the console isn't for. Offers a
 *   different account and how to reach leadership; there is no request form.
 */
export default function AccessDenied({
  section,
  consoleHref,
}: {
  section: string | null;
  consoleHref: string | null;
}) {
  return (
    <section className="content-nf" role="alert">
      <div className="wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cosmic/a/mascot-peek.png" alt="" />
        <div className="eyebrow k">403</div>
        <h1 className="display">
          {section
            ? `No access to ${section}`
            : "The console isn't open to you"}
        </h1>
        <p>
          {section
            ? "Your roles don't include the permission this section needs. Another officer with it, or the President, can change that."
            : "The console is for officers, and the account you're signed in with doesn't have a role that opens it. If that's wrong, or you signed in with the wrong account, there's a way to fix it."}
        </p>
        <div className="content-nf-actions">
          {section && consoleHref ? (
            <span className="btn-shadow">
              <LinkButton href={consoleHref} variant="default">
                <ArrowLeftIcon weight="bold" aria-hidden /> Back to the console
              </LinkButton>
            </span>
          ) : (
            <span className="btn-shadow">
              <LinkButton href="/" variant="default">
                <HouseIcon weight="bold" aria-hidden /> Back to the site
              </LinkButton>
            </span>
          )}
          {!section && (
            <form action={signOut}>
              <input type="hidden" name="callbackPath" value="/auth" />
              <Button type="submit" variant="secondary">
                <SignInIcon weight="bold" aria-hidden /> Switch account
              </Button>
            </form>
          )}
        </div>
        {!section && (
          <p className="content-nf-ref">
            Contact leadership on{" "}
            <TextLink href="/discord" className="inline">
              Discord
            </TextLink>{" "}
            or at{" "}
            <TextLink href={`mailto:${CONTACT_EMAIL}`} className="inline">
              {CONTACT_EMAIL}
            </TextLink>
            .
          </p>
        )}
      </div>
    </section>
  );
}
