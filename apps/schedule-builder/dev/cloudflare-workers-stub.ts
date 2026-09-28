// `next dev`'s stand-in for the `cloudflare:workers` module (see
// next.config.ts's `turbopack.resolveAlias`, development phase only).
//
// `next dev` runs outside workerd -- there is no Worker to provide the real
// `cloudflare:workers` module the way `vinext build`/`wrangler dev` do, and
// Turbopack has no built-in resolution for the `cloudflare:` scheme at all,
// so the bare specifier fails to resolve rather than silently returning
// empty bindings. `~/server/db`'s `import { env as workerEnv } from
// "cloudflare:workers"` (and `~/server/attendance/rateLimit.ts`, `~/server/
// email/send.ts` on platform) already treat an empty `env` as "no bindings"
// and fall back to local equivalents (`DB_URL`, a no-op rate limit, a
// console warning) -- see their own doc comments -- so this only needs to
// mirror the same empty shape the vitest configs' `cloudflare-modules-stub`
// plugin loads for `cloudflare:*` specifiers under Vitest.
export const env = {};
