import { requireSession } from "~/server/auth/require";

/**
 * The console's ground, and its one universal gate.
 *
 * Being signed in is the only thing every page under `/console` needs, so it
 * is checked once here rather than at the top of each of them — a page added
 * under this route later cannot forget it. What each page needs *beyond* a
 * session differs (moderation, audit-log and permissions want three different
 * flags), so the specific check stays with the page that knows which one it is.
 * See `~/server/auth/require`.
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
