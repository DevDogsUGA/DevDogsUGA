import {
  baselineCsp,
  originOf,
  type CspDirectives,
  type Environment,
} from "@devdogsuga/headers";
import { THEME_INIT_SCRIPT_HASH } from "~/config/theme-init-script";

export interface ScheduleBuilderCspInput {
  environment: Environment;
  supabaseUrl: string;
  /** `NEXT_PUBLIC_SCHEDULE_BUILDER_SENTRY_DSN`; falsy before onboarding. */
  sentryDsn?: string | null;
  nonce?: string;
}

/**
 * Schedule-builder's CSP: the shared baseline plus Supabase and Sentry. A new
 * third-party origin for this app is a change here and nowhere else.
 */
export function scheduleBuilderCsp(
  input: ScheduleBuilderCspInput,
): CspDirectives {
  const csp = baselineCsp({
    nonce: input.nonce,
    environment: input.environment,
  });
  const supabase = originOf(input.supabaseUrl);
  const sentry = input.sentryDsn ? originOf(input.sentryDsn) : null;
  return {
    ...csp,
    "img-src": [...csp["img-src"]!, ...(supabase ? [supabase] : [])],
    "connect-src": [
      ...csp["connect-src"]!,
      ...(supabase ? [supabase] : []),
      ...(sentry ? [sentry] : []),
    ],
    // `global-error.tsx`'s inline theme script can't carry the nonce (see
    // `theme-init-script.ts`'s doc comment), so it earns trust through a
    // content hash instead. CSP3 keeps hash sources trusted alongside
    // `'strict-dynamic'`.
    "script-src": [...csp["script-src"]!, THEME_INIT_SCRIPT_HASH],
  };
}
