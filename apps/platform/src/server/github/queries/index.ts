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
