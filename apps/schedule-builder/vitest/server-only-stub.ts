// Vitest stand-in for the `server-only` package (see vitest.db.config.ts's
// alias). Vitest externalizes real node_modules packages to Node's native
// `import()` by default, which runs `server-only`'s own index.js and throws
// unconditionally outside Next's webpack graph -- a plugin-based resolveId/
// load stub never gets a chance to intercept it, because externalization
// happens first. Aliasing to a real file *outside* node_modules sidesteps
// that: Vite resolves and transforms it normally, so `import "server-only"`
// becomes this empty module instead.
export {};
