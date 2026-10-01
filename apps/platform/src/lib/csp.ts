import {
  baselineCsp,
  originOf,
  type CspDirectives,
  type Environment,
} from "@devdogsuga/headers";

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

/** Turnstile's frame is the support widget's guest check. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export interface PlatformCspInput {
  environment: Environment;
  supabaseUrl: string;
  /** `NEXT_PUBLIC_PLATFORM_SENTRY_DSN`; falsy before Sentry onboarding. */
  sentryDsn?: string | null;
  nonce?: string;
}

/**
 * The platform's CSP: the shared baseline plus Supabase, Sentry and the
 * support widget's origins. A new third-party origin for the platform is a
 * change here and nowhere else.
 */
export function platformCsp(input: PlatformCspInput): CspDirectives {
  const csp = baselineCsp({
    nonce: input.nonce,
    environment: input.environment,
  });
  const supabase = originOf(input.supabaseUrl);
  const sentry = input.sentryDsn ? originOf(input.sentryDsn) : null;
  return {
    ...csp,
    "img-src": [
      ...csp["img-src"]!,
      ...(supabase ? [supabase] : []),
      ...DISCORD_MEDIA_ORIGINS,
    ],
    "connect-src": [
      ...csp["connect-src"]!,
      ...(supabase ? [supabase] : []),
      ...(sentry ? [sentry] : []),
    ],
    "media-src": ["'self'", ...DISCORD_MEDIA_ORIGINS],
    "frame-src": ["'self'", TURNSTILE_ORIGIN],
  };
}
