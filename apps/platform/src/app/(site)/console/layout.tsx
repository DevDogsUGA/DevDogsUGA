import type { Metadata } from "next";
import { requireSession } from "~/server/auth/require";

/**
 * One `robots` for the whole console, declared here rather than on each of the
 * eight pages below it. Metadata merges shallowly down the segment tree, so a
 * page that exports only a `title` keeps this — which is the property that
 * makes a layout the right place for it: a console page added tomorrow is
 * noindex by default instead of by remembering.
 *
 * This is defence in depth, not the gate. `/console` is disallowed in
 * `robots.txt` and every page checks a permission flag server-side; what a
 * `noindex` adds is the case those two do not cover, which is a URL that
 * reached an index some other way — pasted into a public channel, or found by a
 * crawler that ignores robots.txt. `robots.txt` asks a crawler not to look;
 * this tells one that did look not to publish.
 *
 * The default title is deliberately generic and every page overrides it. It is
 * only ever seen on a route with no `metadata` of its own.
 */
export const metadata: Metadata = {
  title: "Console | DevDogs",
  robots: { index: false },
};

/**
 * The console's ground, and its one universal gate.
 *
 * Being signed in is the only thing every page under `/console` needs, so it is
 * checked once here rather than at the top of each of them — a page added under
 * this route later cannot forget it. What each page needs *beyond* a session
 * differs (moderation, audit-log and permissions want three different flags),
 * so the specific check stays with the page that knows which one it is. See
 * `~/server/auth/require`.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">{children}</div>
  );
}
