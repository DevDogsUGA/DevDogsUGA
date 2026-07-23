import {
  PROFILE_ITEMS,
  PUBLIC_LINKS,
  SEARCH_ONLY_PAGES,
  visibleConsoleItems,
  type NavItem,
} from "~/config/nav";
import type { ResolvedPermissions } from "~/server/actions/permissions";
import type { SearchEntry } from "./types";

function toEntry(item: NavItem, breadcrumbs: string[] = []): SearchEntry {
  return {
    id: `page:${item.href}`,
    title: item.label,
    description: item.description,
    url: item.href,
    icon: item.icon,
    breadcrumbs,
    group: "pages",
  };
}

/**
 * The searchable app pages for one caller: public pages always, signed-in
 * pages for sessions, console pages only where permitted — so search can
 * never leak the existence of a page its caller couldn't open.
 */
export function buildAppSearchEntries(
  permissions: ResolvedPermissions | null,
  credentialsAccess: boolean,
  signedIn: boolean,
): SearchEntry[] {
  return [
    ...PUBLIC_LINKS.map((item) => toEntry(item)),
    ...SEARCH_ONLY_PAGES.map((item) => toEntry(item)),
    ...(signedIn ? PROFILE_ITEMS.map((item) => toEntry(item)) : []),
    ...visibleConsoleItems(permissions, credentialsAccess).map((item) =>
      toEntry(item, ["Console"]),
    ),
  ];
}
