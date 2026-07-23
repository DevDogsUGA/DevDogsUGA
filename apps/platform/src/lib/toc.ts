export interface TOCItem {
  title: string;
  url: string;
  depth: number;
}

/** A heading extracted from a markdown document, as stored with each docs page. */
export interface DocHeading {
  id: string;
  title: string;
  depth: number;
}
