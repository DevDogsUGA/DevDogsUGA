// Proves module resolution a real Workflow entrypoint needs -- WorkflowEntrypoint
// from "cloudflare:workers" and NonRetryableError from "cloudflare:workflows" --
// resolves under this subtree's Workers-runtime tsconfig. Delete this file once a
// real Workflow entrypoint exists in this directory and exercises the same imports.
import type { WorkflowEntrypoint } from "cloudflare:workers";
import type { NonRetryableError } from "cloudflare:workflows";

export type _Proof = [typeof WorkflowEntrypoint, typeof NonRetryableError];
