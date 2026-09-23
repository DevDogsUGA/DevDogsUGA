export interface ProjectFields {
  quality: { name: string } | null;
  priority: { name: string } | null;
  complexity: { name: string } | null;
}

export interface ClosedIssuesResult {
  search: {
    pageInfo: {
      endCursor: string;
      hasNextPage: boolean;
    };
    nodes: {
      closedAt: string;
      assignees: {
        nodes: {
          databaseId: number;
          login: string;
          avatarUrl: string;
        }[];
      };
      projectItems: {
        nodes: [ProjectFields] | [];
      };
    }[];
  };
}

export { default as ClosedIssues } from "./ClosedIssues.gql";

// ── Competitions ─────────────────────────────────────────────────────────────
//
// See `server/github/competitions.ts` for the ingestion these back. Both
// queries select the SAME per-item shape (field config on the Project, this
// item's two field VALUES, and its content narrowed to `Issue`) because the
// single-item query is what a webhook fetches after a `projects_v2_item`
// delivery names one item, and the paginated query is what the nightly
// reconcile fetches for every item at once; `parseProjectItem` in
// `competitions.ts` is the one function that reads either shape, so the two
// cannot drift on what counts as a valid competition.

/** A GraphQL project field, narrowed to the plain (non-select, non-iteration)
 *  shape `ProjectV2Field` is -- text and date fields both take this shape,
 *  distinguished by `dataType`. Null means the field does not exist on the
 *  Project at all, or exists as a different field type (a single-select
 *  "Title", say) -- both are Project-shape drift. */
export interface RawFieldConfig {
  __typename: string;
  name?: string;
  dataType?: string;
}

export interface RawIssueContent {
  __typename: "Issue" | string;
  id: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  createdAt: string;
  closedAt: string | null;
  repository: { nameWithOwner: string };
}

/** The one item shape both competition queries resolve to. */
export interface RawProjectItemFields {
  titleValue: { text: string } | null;
  plannedEndDateValue: { date: string } | null;
  content: RawIssueContent | null;
}

export interface CompetitionProjectItemResult {
  node: null | ({
    id: string;
    project: null | {
      id: string;
      titleField: RawFieldConfig | null;
      plannedEndDateField: RawFieldConfig | null;
    };
  } & RawProjectItemFields);
}

export { default as CompetitionProjectItem } from "./CompetitionProjectItem.gql";

export interface CompetitionsProjectItemsResult {
  node: null | {
    id: string;
    titleField: RawFieldConfig | null;
    plannedEndDateField: RawFieldConfig | null;
    items: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: ({ id: string } & RawProjectItemFields)[];
    };
  };
}

export { default as CompetitionsProjectItems } from "./CompetitionsProjectItems.gql";
