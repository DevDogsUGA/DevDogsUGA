#!/usr/bin/env node
// The package is consumed from source, so there is no dist/ to point at: tsx
// registers a TypeScript loader and the CLI runs straight from src/. A
// committed shim for the same reason as any bin: pnpm only links a bin whose
// target file exists at install time.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
