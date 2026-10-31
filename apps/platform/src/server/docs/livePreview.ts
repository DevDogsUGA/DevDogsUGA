import "server-only";
import { githubClient } from "~/server/github/sync";
import { createPreviewLoader } from "./previewLoader";

export type {
  LivePreview,
  PreviewFailure,
  PreviewLoad,
  PreviewTarget,
} from "./previewLoader";

let loader: ReturnType<typeof createPreviewLoader> | undefined;

/**
 * The process's live-preview loader, over the commit sync's read-only App
 * client (so a throttle the sync hit holds the preview back too). Its memos are
 * the cache by head SHA; they live as long as the isolate does.
 */
export function livePreviews() {
  return (loader ??= createPreviewLoader({
    github: { get: (path, budget) => githubClient().githubFetch(path, budget) },
  }));
}
