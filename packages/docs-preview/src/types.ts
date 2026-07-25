/**
 * Shared types used by both the preview server and the browser client.
 * Keeping them in one place ensures the HTTP contract stays in sync.
 */

export type DocTreeNode =
  | {
      type: "page";
      id: string;
      name: string;
      url: string;
      icon: string;
      restrictVisibility: false;
    }
  | {
      type: "folder";
      id: string;
      name: string | null;
      children: DocTreeNode[];
      defaultOpen?: boolean;
    };

export interface GitInfo {
  branch: string;
  description: string;
}

export interface ChangeEvent {
  type: "change";
  /** Path relative to the project root, always under docs/ (e.g. "docs/getting-started.md"). */
  path: string;
}
