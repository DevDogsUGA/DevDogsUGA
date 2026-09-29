import type { SecurityHeadersInput } from "@devdogsuga/security-headers";
import { env } from "~/env";

/**
 * Discord's CDN and media proxy, for the docs support widget's avatars, emoji,
 * stickers, attachments and embed images.
 */
const DISCORD_MEDIA_ORIGINS = [
  "https://cdn.discordapp.com",
  "https://media.discordapp.net",
  "https://images-ext-1.discordapp.net",
  "https://images-ext-2.discordapp.net",
];

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
    // CI's credential-free validate job loads `next.config.ts` under
    // `SKIP_ENV_VALIDATION`, where this is `undefined` rather than a real URL.
    // A real build never takes the fallback.
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    sentryDsn: env.NEXT_PUBLIC_PLATFORM_SENTRY_DSN,
    nonce,
    // Turnstile's frame is the support widget's guest check.
    extraSources: {
      img: DISCORD_MEDIA_ORIGINS,
      media: DISCORD_MEDIA_ORIGINS,
      frame: ["https://challenges.cloudflare.com"],
    },
  };
}
