/**
 * The Flutter app's environment manifest. NOTHING IMPORTS THIS FILE — Dart
 * cannot — and that is by design: it exists for tooling to read, the same job
 * `supadart.yaml` does, which is why it sits at the package root rather than
 * in a `src/` (`lib/src/` is the Dart convention for private implementation,
 * so a package-root `src/` here would be a false cognate).
 *
 * It is still TypeScript rather than JSON so the `define()` metadata is
 * typechecked — this package's `typecheck` script exists for exactly this one
 * file.
 *
 * ⚠️ TWO manifests, and the split is load-bearing. The `runtime` manifest is
 * the shipped define set: everything in it is compiled into the mobile binary
 * via `--dart-define` (see the dev/build scripts in package.json), and
 * anything compiled into a mobile binary is extractable, so everything here
 * MUST be `secrecy: "public"`. The completeness test enforces that — "no
 * secrets in the app bundle" is a property of this manifest, not a review
 * habit. Dev-time codegen that genuinely needs a secret goes in the separate
 * `tooling` manifest, which ships nothing.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

/**
 * Shipped values, passed as `--dart-define` flags: `SUPABASE_URL=$API_URL`,
 * `SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY`, and
 * `AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE:-devdogs}`. Declared under `client`
 * because that is what `client` means in the registry — inlined into a
 * shipped bundle — even though there is no browser here.
 */
declare({
  source: "study-group-finder",
  server: {},
  client: {
    API_URL: define(z.string(), {
      doc:
        "The Supabase project's base URL. Supplied by .env.generated when " +
        "the local stack is running, and mirrored into " +
        "NEXT_PUBLIC_SUPABASE_URL for the browser.",
      scope: "environment",
      secrecy: "public",
      localStack: true,
    }),
    PUBLISHABLE_KEY: define(z.string(), {
      doc:
        "The Supabase publishable (anon) API key. Safe in a browser -- Row " +
        "Level Security is what protects the data -- and mirrored into " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      scope: "environment",
      secrecy: "public",
      localStack: true,
    }),
    // The schema default mirrors the scripts' `${NEXT_PUBLIC_AUTH_MODE:-devdogs}`
    // shell fallback, which is the mechanism that actually applies today.
    NEXT_PUBLIC_AUTH_MODE: define(
      z.enum(["devdogs", "google"]).default("devdogs"),
      {
        doc:
          "Which sign-in provider to use: devdogs (the platform's OAuth " +
          "server, dev default) or google (the shared Google provider, " +
          "production default). Unset picks the per-environment default.",
        scope: "environment",
        secrecy: "public",
      },
    ),
  },
});

/**
 * Dev-time tooling, never shipped: `generate-types` runs supadart with the
 * service-role key as codegen against the database. It stays out of the
 * runtime manifest above so the "nothing secret in the shipped define set"
 * rule can be enforced without exception.
 */
declare({
  source: "study-group-finder:tooling",
  server: {
    SECRET_KEY: define(z.string(), {
      doc:
        "The Supabase service-role key. Bypasses Row Level Security " +
        "entirely -- server-side only, never in any client bundle.",
      scope: "environment",
      secrecy: "secret",
      localStack: true,
    }),
  },
});
