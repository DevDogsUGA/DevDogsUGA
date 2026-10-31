import { visibleSections } from "~/server/dashboard/sections";
import { PUBLIC_LINKS, SEARCH_ONLY_PAGES, type NavItem } from "~/config/nav";
import { PAGE_SECTIONS } from "~/config/pageSections";
import type { Caller } from "~/server/auth/access";
import { publicProfilesEnabled } from "~/server/features";
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
 * A page, plus one entry per section and field it contains, so "graduation"
 * lands on `/dashboard/profile#graduation` rather than on `/dashboard/profile`.
 *
 * Sub-entries inherit the page's icon and its permission gate: they only come
 * from a page the caller can already see, so search can't leak the shape of a
 * console page it wouldn't open.
 */
function toEntries(item: NavItem, breadcrumbs: string[] = []): SearchEntry[] {
  const entries = [toEntry(item, breadcrumbs)];
  const trail = [...breadcrumbs, item.label];

  for (const section of PAGE_SECTIONS[item.href] ?? []) {
    // /dashboard/profile only renders this card while public profiles are on.
    if (section.id === "publicProfileSettings" && !publicProfilesEnabled()) {
      continue;
    }
    entries.push({
      id: `section:${item.href}#${section.id}`,
      title: section.label,
      url: `${item.href}#${section.id}`,
      icon: item.icon,
      breadcrumbs: trail,
      group: "pages",
      matchOwnTextOnly: true,
    });

    for (const field of section.fields ?? []) {
      entries.push({
        id: `field:${item.href}#${field.id}`,
        title: field.label,
        description: field.description,
        url: `${item.href}#${field.id}`,
        icon: item.icon,
        breadcrumbs: [...trail, section.label],
        group: "pages",
        matchOwnTextOnly: true,
      });
    }
  }

  return entries;
}

/**
 * The searchable app pages for one caller: public pages always, signed-in
 * pages for sessions, console pages only where permitted. Search can never
 * leak the existence of a page its caller couldn't open.
 */
export function buildAppSearchEntries(caller: Caller | null): SearchEntry[] {
  return [
    ...PUBLIC_LINKS.flatMap((item) => toEntries(item)),
    ...SEARCH_ONLY_PAGES.flatMap((item) => toEntries(item)),
    ...visibleSections(caller).flatMap((item) => toEntries(item, [item.group])),
  ];
}
