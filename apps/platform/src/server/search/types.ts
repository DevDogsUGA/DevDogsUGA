import type { NavIcon } from "~/config/nav";

export interface SearchEntry {
  id: string;
  title: string;
  description?: string;
  url: string;
  icon: NavIcon;
  breadcrumbs: string[];
  group: "pages" | "docs";
  /**
   * Disqualifies the entry when every query token matched only a breadcrumb.
   * Set on section/field entries, whose breadcrumbs are their parent page's.
   * Without it, "account" would return all thirteen fields on /account.
   */
  matchOwnTextOnly?: true;
  /** Pre-escaped HTML with <mark> highlights, from docs full-text search. */
  snippet?: string;
}
