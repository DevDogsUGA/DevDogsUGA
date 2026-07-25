#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
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

// ── Argument parsing ──────────────────────────────────────────────────────────

interface Args {
  help: boolean;
  baseUrl: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const result: Args = { help: false, baseUrl: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") {
      result.help = true;
    } else if (argv[i] === "--base-url" && argv[i + 1]) {
      result.baseUrl = argv[++i];
    }
  }
  return result;
}

function printHelp(): void {
  console.log(`devdogs-oauth-setup

Configures your local Supabase project to support "Sign in with DevDogs" OAuth.

Options:
  --base-url <url>  DevDogs API URL (default: ${DEFAULT_API_URL})
  --help, -h        Show this message

Environment variables (any source — shell, direnv, .env, etc.):
  ${ENV_KEYS.baseUrl}          DevDogs API URL
  ${ENV_KEYS.providerName}   Display name for the provider
  ${ENV_KEYS.clientId}       OAuth client ID
  ${ENV_KEYS.clientSecret}   OAuth client secret

Local Supabase credentials are detected automatically via \`supabase status\`.`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bail(message = "Setup cancelled."): never {
  cancel(message);
  process.exit(1);
}

/** Exits if the value is a cancel symbol; otherwise returns it as-is. */
function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value as T;
}

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
      s.error("Could not detect local Supabase");
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

// ── Wizard ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  intro("DevDogs OAuth setup");
  log.info(
    'Configures your local Supabase to support "Sign in with DevDogs" OAuth.',
  );

  // ── Step 1: DevDogs API base URL ───────────────────────────────────────────

  let baseUrl =
    args.baseUrl ?? process.env[ENV_KEYS.baseUrl] ?? DEFAULT_API_URL;

  if (!args.baseUrl) {
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
      s.error("Failed to check for existing provider");
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

  outro('All done! You\'re ready to "Sign in with DevDogs".');
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
