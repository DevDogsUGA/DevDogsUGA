#!/usr/bin/env node

/**
 * Two modes, one binary.
 *
 * Bare — `docs-build` — compiles the markdown in the current working directory
 * into `dist/`. That is the `build` script of a content package (see
 * `docs/package.json`), which is what keeps that package free of any code: it
 * holds markdown and a manifest, and this does the work. It takes no arguments
 * and never will; anything else here has to leave it exactly as it was.
 *
 * `docs-build gen` walks the monorepo's TypeScript and Dart sources and writes
 * the generated reference into `docs/<project>/reference/`, which the bare mode
 * then compiles like any other page. It is a separate subcommand rather than a
 * step of the bare mode because it needs the whole repo — the bare mode only
 * ever needs the folder it is run in.
 */
import * as path from "node:path";
import { emitDocsModule } from "./compile.js";

const [subcommand, ...args] = process.argv.slice(2);

if (subcommand === undefined) {
  const contentRoot = process.cwd();
  const outDir = path.join(contentRoot, "dist");

  const count = emitDocsModule(contentRoot, outDir);

  console.log(
    `[docs-build] compiled ${count} page(s) from ${path.basename(contentRoot)}/`,
  );
} else if (subcommand === "gen") {
  // Imported here rather than at the top of the file: the generator pulls in
  // the TypeScript compiler, and the bare mode — which every content build
  // runs — has no use for it.
  const { generateReference } = await import("./gen/run.js");
  const { findRepoRoot } = await import("./gen/program.js");

  const repoRoot = findRepoRoot(process.cwd());

  // The summary is printed by the generator. Nothing is inspected here, because
  // nothing it reports is a failure: doc-comment coverage is reported on every
  // run and never enforced, and an extractor that cannot read a file warns and
  // carries on.
  generateReference({
    repoRoot,
    docsRoot: path.join(repoRoot, "docs"),
    dryRun: args.includes("--dry-run"),
  });
} else {
  console.error(`[docs-build] unknown command "${subcommand}"`);
  console.error("[docs-build] usage: docs-build | docs-build gen [--dry-run]");
  process.exitCode = 1;
}
