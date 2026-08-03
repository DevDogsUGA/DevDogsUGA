export interface TOCItem {
  title: string;
  url: string;
  depth: number;
}

/**
 * A heading extracted from a markdown document. Owned by @devdogsuga/docs,
 * which produces them at build time; re-exported here so UI code can keep
 * importing its types from ~/lib.
 */
export type { DocHeading } from "@devdogsuga/docs";
