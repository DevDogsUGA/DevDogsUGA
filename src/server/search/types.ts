import type { NavIcon } from "~/config/nav";

export interface SearchEntry {
  id: string;
  title: string;
  description?: string;
  url: string;
  icon: NavIcon;
  breadcrumbs: string[];
  group: "pages" | "docs";
  /** Pre-escaped HTML with <mark> highlights, from docs full-text search. */
  snippet?: string;
}
