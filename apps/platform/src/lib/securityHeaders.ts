import type { SecurityHeadersInput } from "@devdogsuga/headers";
import { env } from "~/env";
import { platformCsp } from "~/lib/csp";

/**
 * The platform's security-header inputs, shared by the three places that send
 * them: middleware (every response), the Worker entry (HTML responses, with
 * the nonce it stamps), and `next.config.ts`'s static fallback.
 *
 * Pass a nonce only for an HTML response. The page renders with none, so its
 * HTML can be cached; `cloudflare/nonce.ts` mints one per response at the
 * edge.
 */
export function platformSecurityHeaders(nonce?: string): SecurityHeadersInput {
  return {
    environment: env.DEPLOY_ENV,
    csp: platformCsp({
      environment: env.DEPLOY_ENV,
      // CI's credential-free validate job loads `next.config.ts` under
      // `SKIP_ENV_VALIDATION`, where this is `undefined` rather than a real
      // URL. A real build never takes the fallback.
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
      sentryDsn: env.NEXT_PUBLIC_PLATFORM_SENTRY_DSN,
      nonce,
    }),
  };
}
