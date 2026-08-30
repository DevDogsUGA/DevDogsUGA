/**
 * Configures a Supabase project to accept "Sign in with DevDogs".
 *
 * Was `@devdogsuga/oauth-setup`, a package of its own with its own binary. It
 * was separate because it was going to be published for sibling projects to
 * install; nothing here is published, so that separation bought only a second
 * `@clack/prompts` dependency and a second place to look for a CLI.
 *
 * It still points at whatever project you run it in. That is the point: a
 * forum developer runs it against *their* local Supabase, not this one.
 */
import { execFile } from "node:child_process";
import {
  confirm,
  log,
  note,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";
import {
  DEFAULT_API_URL,
  ENV_KEYS,
  PROVIDER_IDENTIFIER,
  PROVIDER_NAME,
  WEBSITE_URL,
} from "./config.js";
import { upsertEnvLocal } from "./env-file.js";
import {
  checkProvider,
  detectLocalSupabase,
  upsertDevDogsProvider,
  type LocalSupabaseConfig,
} from "./db.js";
import { bail, unwrap } from "../ui.js";

/** Opens `url` in the user's default browser, cross-platform. */
function openBrowser(url: string): void {
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", url]);
  } else if (process.platform === "darwin") {
    execFile("open", [url]);
  } else {
    execFile("xdg-open", [url]);
  }
}

/** Runs `supabase status`, retrying if not running. */
async function detectWithRetry(cwd: string): Promise<LocalSupabaseConfig> {
  while (true) {
    const s = spinner();
    s.start("Detecting local Supabase");
    try {
      const config = detectLocalSupabase(cwd);
      s.stop(`Connected to ${config.apiUrl}`);
      return config;
    } catch (err) {
      s.stop("Could not detect local Supabase");
      log.error(err instanceof Error ? err.message : String(err));
      note(
        "1. Make sure Docker is running\n" +
          "2. Run `supabase start` in your project directory\n" +
          "3. Confirm it's running with `supabase status`",
        "Troubleshooting",
      );
      const retry = unwrap(
        await confirm({ message: "Ready to retry?", initialValue: true }),
      );
      if (!retry) bail("Run `supabase start` then try again.");
    }
  }
}

/**
 * The wizard. `baseUrl`, when given, skips the first prompt.
 *
 * Intro and outro are the caller's, so this composes into the devtools menu
 * without drawing a second box inside the first.
 */
export async function runOAuthSetup(baseUrlOverride?: string): Promise<void> {
  const cwd = process.cwd();

  log.info(
    'Configures the Supabase project in this directory to support "Sign in with DevDogs".',
  );

  // ── Step 1: DevDogs API base URL ───────────────────────────────────────────

  let baseUrl =
    baseUrlOverride ?? process.env[ENV_KEYS.baseUrl] ?? DEFAULT_API_URL;

  if (!baseUrlOverride) {
    baseUrl = unwrap(
      await text({
        message: "DevDogs API URL",
        initialValue: baseUrl,
        validate: (v) => {
          if (!v) return;
          try {
            new URL(v);
          } catch {
            return "Enter a valid URL (e.g. https://api.devdogsuga.org)";
          }
        },
      }),
    );
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  // ── Step 2: Provider display name ─────────────────────────────────────────

  const providerName = unwrap(
    await text({
      message: "Provider display name",
      initialValue: process.env[ENV_KEYS.providerName] ?? PROVIDER_NAME,
      placeholder: PROVIDER_NAME,
    }),
  );

  // ── Step 3: OAuth client credentials ───────────────────────────────────────

  let clientId: string | undefined =
    process.env[ENV_KEYS.clientId] || undefined;
  let clientSecret: string | undefined =
    process.env[ENV_KEYS.clientSecret] || undefined;

  if (clientId && clientSecret) {
    const useSaved = unwrap(
      await confirm({
        message: `Use saved credentials? (client ID: ${clientId})`,
        initialValue: true,
      }),
    );
    if (!useSaved) {
      clientId = undefined;
      clientSecret = undefined;
    }
  }

  if (!clientId || !clientSecret) {
    note(
      `1. Visit ${WEBSITE_URL}/tools/oauth\n` +
        `2. Sign in — link your GitHub account if prompted\n` +
        `3. Enable OAuth and copy your Client ID and Client Secret\n` +
        `   (the secret is shown once, immediately after you enable it)`,
      "Register an OAuth client",
    );

    clientId = unwrap(
      await text({
        message: "Client ID",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      }),
    ).trim();

    clientSecret = unwrap(
      await password({
        message: "Client Secret",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      }),
    ).trim();
  }

  // ── Step 4: Detect local Supabase ─────────────────────────────────────────

  const localConfig = await detectWithRetry(cwd);

  // ── Step 5: Resolve provider identifier ───────────────────────────────────

  let identifier = PROVIDER_IDENTIFIER;

  {
    const s = spinner();
    s.start(`Checking for existing ${identifier} provider`);
    let existing: { exists: boolean; name?: string };
    try {
      existing = await checkProvider(localConfig, identifier);
      s.stop(
        existing.exists
          ? `Found existing ${identifier} provider (${existing.name ?? "unnamed"})`
          : `No existing ${identifier} provider — will create`,
      );
    } catch (err) {
      s.stop("Failed to check for existing provider");
      throw err;
    }

    if (existing.exists) {
      const action = unwrap(
        await select({
          message: `Provider "${identifier}" already exists. What would you like to do?`,
          options: [
            {
              value: "update" as const,
              label: "Update existing provider",
              hint: "Overwrites client ID, secret, name, and issuer",
            },
            {
              value: "new" as const,
              label: "Add a new provider with a different identifier",
              hint: `e.g. custom:devdogs-staging`,
            },
          ],
        }),
      );

      if (action === "new") {
        const suffix = unwrap(
          await text({
            message: `New identifier suffix — will be registered as "custom:<suffix>"`,
            placeholder: "devdogs-staging",
            validate: (v) => {
              if (!v?.trim()) return "Required";
              if (/[^a-z0-9-]/.test(v.trim()))
                return "Use only lowercase letters, numbers, and hyphens";
            },
          }),
        ).trim();
        identifier = `custom:${suffix}`;
      }
    }
  }

  // ── Step 6: Upsert custom OAuth provider ───────────────────────────────────

  const issuer = `${baseUrl}/auth/v1`;
  const s = spinner();
  s.start(`Configuring ${identifier}`);
  const row = await upsertDevDogsProvider(localConfig, {
    identifier,
    name: providerName,
    clientId,
    clientSecret,
    issuer,
  });
  s.stop(`Configured ${row.identifier} (issuer: ${row.issuer})`);

  // ── Step 7: Persist config to .env.local ───────────────────────────────────

  upsertEnvLocal(cwd, {
    [ENV_KEYS.baseUrl]: baseUrl,
    [ENV_KEYS.providerName]: providerName,
    [ENV_KEYS.clientId]: clientId,
    [ENV_KEYS.clientSecret]: clientSecret,
  });
  log.success("Credentials saved to .env.local");

  // ── Step 8: Redirect URI registration ────────────────────────────────────

  const callbackUri = `${localConfig.apiUrl}/auth/v1/callback`;

  const alreadyRegistered = unwrap(
    await confirm({
      message:
        "Have you already registered your Supabase callback URL with DevDogs?",
      initialValue: false,
    }),
  );

  if (!alreadyRegistered) {
    const keysUrl = `${WEBSITE_URL}/tools/oauth?add_redirect_uri=${encodeURIComponent(callbackUri)}`;
    log.info(`Opening ${keysUrl}`);
    openBrowser(keysUrl);
  }

  // ── Step 9: Next-steps checklist ──────────────────────────────────────────

  const nextSteps: string[] = [];
  let step = 1;

  if (!alreadyRegistered) {
    nextSteps.push(
      `${step++}. Finish registering your callback URL in the browser that just opened:`,
      `   Local:      ${callbackUri}`,
      `   Production: https://<your-project>.supabase.co/auth/v1/callback`,
      ``,
    );
  }

  nextSteps.push(
    `${step++}. Make sure your project's supabase/config.toml allows your app callback:`,
    `   additional_redirect_urls = ["http://localhost:<port>/auth/callback"]`,
    ``,
    `${step++}. Trigger sign-in from your app:`,
    ``,
    `   await supabase.auth.signInWithOAuth({`,
    `     provider: "${identifier}",`,
    `     options: { redirectTo: \`\${origin}/auth/callback\` },`,
    `   });`,
  );

  note(nextSteps.join("\n"), "Next steps");
}
