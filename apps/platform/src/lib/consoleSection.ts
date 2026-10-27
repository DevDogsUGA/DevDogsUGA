import { CONSOLE_ITEMS, type ConsoleItem } from "~/config/nav";

/**
 * The console section a path belongs to: the item whose page is the path or a
 * parent of it (`/console/attendance/<id>` is Attendance). The longest match
 * wins. Null for a path no item owns.
 */
export function consoleSectionFor(
  path: string | null | undefined,
): ConsoleItem | null {
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0]!;
  let best: ConsoleItem | null = null;
  for (const item of CONSOLE_ITEMS) {
    const owns = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (owns && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}
