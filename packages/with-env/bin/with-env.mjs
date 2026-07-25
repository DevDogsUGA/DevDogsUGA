#!/usr/bin/env node
// Thin launcher so the bin can stay TypeScript with no build step. A `node`
// shebang is what package-manager bin shims handle most reliably (notably the
// generated .cmd on Windows), and resolving tsx through this package's own
// dependencies avoids relying on it being on PATH.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
