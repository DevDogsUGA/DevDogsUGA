#!/usr/bin/env node

/**
 * Compiles the markdown in the current working directory into `dist/`.
 *
 * Run as the `build` script of a content package (see `docs/package.json`),
 * which is what keeps that package free of any code: it holds markdown and a
 * manifest, and this does the work.
 */
import * as path from "node:path";
import { emitDocsModule } from "./compile.js";

const contentRoot = process.cwd();
const outDir = path.join(contentRoot, "dist");

const count = emitDocsModule(contentRoot, outDir);

console.log(
  `[docs-build] compiled ${count} page(s) from ${path.basename(contentRoot)}/`,
);
