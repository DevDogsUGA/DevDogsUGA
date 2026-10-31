/**
 * Markdown → HTML without the code highlighter: the renderer the platform's
 * Worker uses for its live docs preview.
 *
 * The same plugin list as `render.ts` (`render-pipeline.ts`), with the frame
 * and checks of `docsCodeBlocks` but no Shiki, because Shiki's Oniguruma engine
 * compiles WebAssembly at run time and the Workers runtime does not allow that
 * (see `plain-code.ts`). Nothing reachable from here imports Shiki or the file
 * system; `preview-graph.test.ts` holds that line.
 */
import { rehypePlainCode } from "./plain-code.js";
import { createBodyRenderer, type BodyRenderer } from "./render-pipeline.js";

/** One page body as HTML, code blocks framed but not coloured. */
export const renderBodyPlain: BodyRenderer =
  createBodyRenderer(rehypePlainCode);
