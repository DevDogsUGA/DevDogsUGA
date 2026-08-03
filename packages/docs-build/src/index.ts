/**
 * Markdown → typed data. Consumed two ways:
 *
 * - as the `docs-build` CLI, which a content package runs as its `build`
 *   script to emit `dist/index.js` + `dist/index.d.ts`;
 * - as a library, for the types those generated declarations refer to.
 */
export { compileDocs, emitDocsModule } from "./compile.js";
export { parseDocFile, toTitleCase } from "./parse.js";
export type {
  DocHeading,
  DocsPage,
  DocsProject,
  ParsedDocFile,
} from "./types.js";
