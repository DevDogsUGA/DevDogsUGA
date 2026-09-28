// `next dev`'s stand-in for `cloudflare:workers` (see next.config.ts). There is
// no Worker under `next dev`, and `~/server/db` already treats an empty `env`
// as "no HYPERDRIVE binding" and falls back to DB_URL. Same empty shape the
// vitest configs stub `cloudflare:*` specifiers with.
export const env = {};
