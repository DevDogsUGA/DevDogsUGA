import Link from "next/link";
import { CONTACT_EMAIL } from "~/config/nav";
import signOut from "~/server/actions/signOut";
import { TextLink } from "~/classic/ui/text-link";

const BACK_LINK =
  "text-sm text-mauve-400 underline-offset-4 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

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
    <section
      role="alert"
      className="relative isolate mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 @sm:px-6"
    >
      <h1 className="font-display text-3xl font-bold text-rose-300">403</h1>
      <p className="text-base font-medium text-white">
        {section ? `No access to ${section}` : "The console isn't open to you"}
      </p>
      <p className="max-w-prose text-sm text-mauve-400">
        {section
          ? "Your roles don't include the permission this section needs. Another officer with it, or the President, can change that."
          : "The console is for officers, and the account you're signed in with doesn't have a role that opens it. If that's wrong, or you signed in with the wrong account, there's a way to fix it."}
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {section && consoleHref ? (
          <Link href={consoleHref} className={BACK_LINK}>
            Back to the console
          </Link>
        ) : (
          <Link href="/" className={BACK_LINK}>
            Back to the site
          </Link>
        )}
        {!section && (
          <form action={signOut}>
            <input type="hidden" name="callbackPath" value="/auth" />
            <button type="submit" className={BACK_LINK}>
              Switch account
            </button>
          </form>
        )}
      </div>
      {!section && (
        <p className="text-sm text-mauve-400">
          Contact leadership on <TextLink href="/discord">Discord</TextLink> or
          at{" "}
          <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>.
        </p>
      )}
    </section>
  );
}
