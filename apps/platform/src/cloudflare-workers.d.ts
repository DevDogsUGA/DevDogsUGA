/**
 * Ambient shim for `cloudflare:workers`, scoped to the Next/DOM-lib program
 * ONLY.
 *
 * Four files under `src` import `env` from `cloudflare:workers` this way:
 * `~/server/db/index.ts` (HYPERDRIVE), `~/server/email/send.ts` (EMAIL),
 * `~/server/attendance/rateLimit.ts` (ATTENDANCE_RATE_LIMITER), and
 * `~/server/deployment.ts` (CF_VERSION_METADATA, SENTRY_RELEASE). This program never
 * reaches into `cloudflare/tsconfig.json`'s Workers-runtime program (its
 * `include` is rooted at `cloudflare/` and nothing there imports back into
 * `src/server/db`, unlike apps/schedule-builder's `ScrapeWorkflow.ts`), so
 * there is no collision to avoid the way that app's shim describes -- this
 * file exists anyway because `src`'s own program (tsconfig.json, DOM lib)
 * has no ambient declaration for `cloudflare:workers` at all otherwise.
 *
 * Kept structural and minimal (just the bindings these files read),
 * the same reasoning as apps/schedule-builder's identical shim: importing the
 * wrangler-generated `CloudflareEnv`/`Cloudflare.Env` type here would mean
 * importing `cloudflare-env.d.ts` into this DOM-lib program too, merging in
 * its Workers-runtime globals -- see `cloudflare/tsconfig.json`'s comment for
 * why those two collide.
 */
declare module "cloudflare:workers" {
  export const env: {
    HYPERDRIVE?: { readonly connectionString: string };
    EMAIL?: {
      send(message: {
        to: string;
        from: { email: string; name?: string };
        subject: string;
        html: string;
        text: string;
      }): Promise<unknown>;
    };
    ATTENDANCE_RATE_LIMITER?: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
    SENTRY_RELEASE?: string;
  };
}
