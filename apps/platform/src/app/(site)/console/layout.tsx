import type { Metadata } from "next";
import { requireSession } from "~/server/auth/require";

/**
 * One `robots` for the whole console, declared here rather than on each of the
 * eight pages below it. Metadata merges shallowly down the segment tree, so a
 * page that exports only a `title` keeps this, which is why a layout is the
 * right place for it: a console page added tomorrow is noindex by default
 * instead of by someone remembering.
 *
 * This is defence in depth, not the gate. `/console` is disallowed in
 * `robots.txt` and every page checks a permission flag server-side. `noindex`
 * covers the case those two miss: a URL that reached an index some other way,
 * pasted into a public channel or found by a crawler that ignores robots.txt.
 *
 * The default title is deliberately generic and every page overrides it. It is
 * only ever seen on a route with no `metadata` of its own.
 */
export const metadata: Metadata = {
  title: "Console | DevDogs",
  robots: { index: false },
};

/**
 * Wraps every `/console` page and holds their one shared gate: a session. A
 * signed-out visitor gets the 404, checked once here so a page added under this
 * route later cannot forget it.
 *
 * Who may use a page is the page's own check, which renders the access-denied
 * card (see `~/server/auth/require`). It is not a console permission flag for
 * every page: some admit a leadership role or a project's advisors with no flag
 * at all, so a shared "has some console permission" check here would turn them
 * away before their page could decide.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <div className="flex min-w-0 flex-1 flex-col *:w-full">{children}</div>
  );
}
