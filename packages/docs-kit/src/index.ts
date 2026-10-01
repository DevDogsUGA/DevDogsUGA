/**
 * Markdown → typed data. Consumed two ways:
 *
 * - as the `docs-kit` CLI, which a content package runs as its `build`
 *   script to emit `dist/index.js` + `dist/index.d.ts`;
 * - as a library, for the types those generated declarations refer to.
 */
export { compileDocs, emitDocsModule } from "./compile.js";
export { type CodeIcon } from "./codeicons.js";
export { type DocsDiff } from "./diffs.js";
export { DocsBuildError } from "./errors.js";
export { parseDocFile, toTitleCase } from "./parse.js";
export {
  DEFAULT_OS,
  VARIANT_GROUPS,
  type VariantContext,
  type VariantGroup,
} from "./variants.js";
export type {
  CompiledPage,
  DocHeading,
  DocsFolder,
  DocsPage,
  DocsProject,
  DocsSection,
  ParsedDocFile,
} from "./types.js";
