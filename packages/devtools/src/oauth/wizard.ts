/**
 * Configures a Supabase project to accept "Sign in with DevDogs".
 *
 * Was `@devdogsuga/oauth-setup`, a package of its own with its own binary. It
 * was separate because it was going to be published for sibling projects to
 * install; nothing here is published, so that separation bought only a second
 * `@clack/prompts` dependency and a second place to look for a CLI.
 *
 * Two axes, chosen independently:
 *
 *   * TARGET — which Supabase project gets the custom provider: the one
 *     `supabase status` reports for this directory, or a hosted one
 *     (staging/production, or someone else's) named by URL + service-role
 *     key. See `target.ts`.
 *   * CONNECT METHOD — how the OAuth client's `client_id`/`client_secret`
 *     are obtained: the one-click flow (default, TASK-351) opens a browser
 *     at the platform's `/oauth/connect`, waits on a loopback
 *     listener, and exchanges a PKCE-protected code for them; "Paste
 *     credentials instead" is the original manual flow, for a platform that
 *     is unreachable or a contributor who would rather not open a browser.
 */
import {
  confirm,
  log,
  note,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { DeployEnvironment } from "@devdogsuga/sdk/env/targets";
import {
  DEFAULT_API_URLS,
  ENV_KEYS,
  PROVIDER_IDENTIFIER,
  PROVIDER_NAME,
  WEBSITE_URL,
} from "./config.js";
import { upsertEnvLocal } from "./env-file.js";
import { checkProvider, upsertDevDogsProvider } from "./db.js";
import { DiscoveryError, fetchIssuerFromAny } from "./discovery.js";
import { openBrowser } from "./browser.js";
import {
  codeChallengeFor,
  generateCodeVerifier,
  generateState,
} from "./pkce.js";
import {
  CallbackDeniedError,
  CallbackMalformedError,
  CallbackTimeoutError,
  StateMismatchError,
  start as startLoopback,
  verifyState,
  type LoopbackListener,
} from "./loopback.js";
import { buildConnectUrl } from "./connect-url.js";
import {
  ExchangeError,
  exchangeCode,
  type ExchangeResult,
} from "./exchange.js";
import {
  DeviceError,
  PollError,
  pollForToken,
  requestDeviceCode,
  type DeviceCodeResult,
} from "./device.js";
import { decideTransport, type ConnectTransport } from "./transport.js";
import { defaultLabel } from "./label.js";
import {
  HostedCredentialsMissingError,
  NoTierResolvedError,
  readHostedTargetFromEnvFiles,
  resolveLocalTarget,
  resolveHostedTargetInRepo,
  type ConnectTarget,
} from "./target.js";
import { loadEnvSession } from "@devdogsuga/cli-core/repo/peers";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { resolveTier } from "@devdogsuga/cli-core/tier";
import { bail, errorMessage, unwrap } from "@devdogsuga/cli-core/ui";

/** Runs `supabase status`, retrying if not running. */
async function detectLocalWithRetry(cwd: string): Promise<ConnectTarget> {
  while (true) {
    const s = spinner();
    s.start("Detecting local Supabase");
    try {
      const target = await resolveLocalTarget(cwd);
      s.stop(`Connected to ${target.apiUrl}`);
      return target;
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

function requireUrl(v: string | undefined): string | undefined {
  if (!v) return "Required";
  try {
    new URL(v);
    return undefined;
  } catch {
    return "Enter a valid URL";
  }
}

/** An environment variable's value, with an empty one treated as unset. */
function nonEmptyEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === "" ? undefined : value;
}

function requireNonEmpty(v: string | undefined): string | undefined {
  return v?.trim() ? undefined : "Required";
}

/** A hosted target reached from INSIDE a DevDogsUGA checkout: asks which tier, lazily. */
async function chooseHostedTargetInRepo(): Promise<ConnectTarget> {
  try {
    return await resolveHostedTargetInRepo(undefined, {
      resolveTier: (tierArg, message) =>
        resolveTier(tierArg, message, { label: "devtools oauth" }),
      enterEnvironment: async (tier: DeployEnvironment) => {
        const envSession = await loadEnvSession();
        // `override: true` — a DELIBERATE, later choice of tier here must
        // win over the `development` the (envFree) launcher already
        // entered before this command ever ran. See `target.ts`'s
        // `RepoHostedTargetDeps.enterEnvironment`.
        await envSession.enterEnvironment(tier, { override: true });
      },
    });
  } catch (err) {
    if (err instanceof HostedCredentialsMissingError) bail(err.message);
    if (err instanceof NoTierResolvedError) bail("No tier selected.");
    throw err;
  }
}

/** A hosted target reached from OUTSIDE any checkout: `.env.local`/`.env`, else a prompt. */
async function chooseHostedTargetFromEnvOrPrompt(
  cwd: string,
): Promise<ConnectTarget> {
  const fromFiles = readHostedTargetFromEnvFiles(cwd);

  if (fromFiles.apiUrl && fromFiles.serviceRoleKey) {
    log.info(
      "Using the Supabase URL and service-role key from .env.local/.env.",
    );
    return {
      apiUrl: fromFiles.apiUrl,
      serviceRoleKey: fromFiles.serviceRoleKey,
      kind: "hosted",
    };
  }

  const apiUrl = unwrap(
    await text({ message: "Supabase project URL", validate: requireUrl }),
  ).replace(/\/+$/, "");
  const serviceRoleKey = unwrap(
    await password({
      message: "Supabase service-role key",
      validate: requireNonEmpty,
    }),
  ).trim();

  return { apiUrl, serviceRoleKey, kind: "hosted" };
}

/** Step 1: choose which Supabase project this run configures. */
async function chooseTarget(cwd: string): Promise<ConnectTarget> {
  const insideRepo = discoverRepoRoot(cwd) !== null;

  const kind = unwrap(
    await select({
      message: "Which Supabase project are you configuring?",
      options: [
        {
          value: "local" as const,
          label: "Local (this directory)",
          hint: "supabase status",
        },
        {
          value: "hosted" as const,
          label: "A hosted project",
          hint: insideRepo
            ? "staging, production, or another project"
            : "reads .env.local/.env, or asks",
        },
      ],
    }),
  );

  if (kind === "local") return detectLocalWithRetry(cwd);
  return insideRepo
    ? chooseHostedTargetInRepo()
    : chooseHostedTargetFromEnvOrPrompt(cwd);
}

/** One human-readable line per `ExchangeError` kind. */
function describeExchangeError(err: ExchangeError): string {
  switch (err.kind) {
    case "invalid_grant":
      return `The authorization code was rejected (${err.message}). Run the command again.`;
    case "rate_limited":
      return err.message;
    case "network":
    case "malformed":
    case "invalid_request":
      return err.message;
  }
}

/** One human-readable line per `DeviceError` kind (see `device.ts`'s `requestDeviceCode`). */
function describeDeviceError(err: DeviceError): string {
  switch (err.kind) {
    case "rate_limited":
    case "network":
    case "malformed":
    case "invalid_request":
      return err.message;
  }
}

/** One human-readable line per `PollError` kind (see `device.ts`'s `pollForToken`). */
function describePollError(err: PollError): string {
  switch (err.kind) {
    case "invalid_grant":
      return `The device code was rejected (${err.message}). Run the command again.`;
    case "access_denied":
    case "expired_token":
    case "invalid_request":
    case "network":
    case "malformed":
      return err.message;
  }
}

/**
 * Step 2 (one-click branch, device transport): request a device code,
 * show the user code and verification URL prominently, try to open a
 * browser to it (failure is not fatal — the URL is already on screen), and
 * poll until the platform reports the user approved it, denied it, or the
 * code expired.
 */
async function connectByDevice(
  target: ConnectTarget,
  platformUrl: string,
  cwd: string,
  transportReason: string,
): Promise<ExchangeResult> {
  const label = defaultLabel(cwd);
  const callbackUri = `${target.apiUrl}/auth/v1/callback`;

  log.info(`Using the device-code flow — ${transportReason}.`);

  const requestSpinner = spinner();
  requestSpinner.start("Requesting a device code");
  let device: DeviceCodeResult;
  try {
    device = await requestDeviceCode({ platformUrl, label, callbackUri });
    requestSpinner.stop("Got a device code");
  } catch (err) {
    requestSpinner.stop("Could not request a device code");
    if (err instanceof DeviceError) bail(describeDeviceError(err));
    throw err;
  }

  note(
    `Enter this code: ${device.userCode}\n` +
      `At: ${device.verificationUri}\n\n` +
      `Or open this URL directly:\n${device.verificationUriComplete}`,
    "Approve the connection",
  );
  log.info(`Opening ${device.verificationUriComplete}`);
  openBrowser(device.verificationUriComplete);

  const pollSpinner = spinner();
  pollSpinner.start(
    `Waiting for you to enter ${device.userCode} and approve the connection`,
  );
  try {
    const result = await pollForToken({
      platformUrl,
      deviceCode: device.deviceCode,
      intervalSeconds: device.interval,
      expiresInSeconds: device.expiresIn,
    });
    pollSpinner.stop("Approved");
    return result;
  } catch (err) {
    pollSpinner.stop("Connection not completed");
    if (err instanceof PollError) bail(describePollError(err));
    throw err;
  }
}

/**
 * Step 2 (one-click branch): browser + loopback callback + exchange, given
 * an ALREADY-STARTED `listener` — starting it is `connectViaOneClick`'s job,
 * not this function's, so that the one failure that should fall back to the
 * device flow (the listener failing to even start) is never confused with
 * any failure in here, all of which are this flow's own and must propagate
 * (or `bail()`) unchanged rather than triggering a fallback.
 *
 * Always closes the listener, on every exit path — success, denial,
 * malformed callback, state mismatch, timeout, or an exchange error.
 */
async function connectOneClick(
  target: ConnectTarget,
  platformUrl: string,
  cwd: string,
  transportReason: string,
  listener: LoopbackListener,
): Promise<ExchangeResult> {
  const verifier = generateCodeVerifier();
  const challenge = codeChallengeFor(verifier);
  const state = generateState();
  const label = defaultLabel(cwd);
  const callbackUri = `${target.apiUrl}/auth/v1/callback`;

  log.info(`Using the loopback flow — ${transportReason}.`);

  try {
    const connectUrl = buildConnectUrl({
      platformUrl,
      redirectUri: listener.redirectUri,
      codeChallenge: challenge,
      state,
      label,
      callbackUri,
    });

    log.info(`Opening ${connectUrl}`);
    openBrowser(connectUrl);
    note(
      `If your browser did not open, visit this URL:\n${connectUrl}`,
      "Approve the connection",
    );

    const s = spinner();
    s.start("Waiting for you to approve the connection in your browser");
    let callback: { code: string; state: string };
    try {
      callback = await listener.result;
    } catch (err) {
      s.stop("Connection not completed");
      if (err instanceof CallbackDeniedError) {
        bail(
          err.errorCode === "access_denied"
            ? "Connection declined in the browser."
            : `Connection failed: ${err.message}`,
        );
      }
      if (err instanceof CallbackTimeoutError) bail(err.message);
      if (err instanceof CallbackMalformedError) bail(err.message);
      throw err;
    }
    s.stop("Approved");

    let verified: { code: string; state: string };
    try {
      verified = verifyState(state, callback);
    } catch (err) {
      if (err instanceof StateMismatchError) bail(err.message);
      throw err;
    }

    const exchangeSpinner = spinner();
    exchangeSpinner.start("Exchanging the authorization code");
    try {
      const result = await exchangeCode({
        platformUrl,
        code: verified.code,
        codeVerifier: verifier,
      });
      exchangeSpinner.stop("Connected");
      return result;
    } catch (err) {
      exchangeSpinner.stop("Could not complete the exchange");
      if (err instanceof ExchangeError) bail(describeExchangeError(err));
      throw err;
    }
  } finally {
    listener.close();
  }
}

/**
 * Step 2 (one-click branch): decides loopback vs. device (see `transport.ts`)
 * and runs it.
 *
 * `transportOverride` is `--device`/`--loopback` (see `catalog.ts`'s `oauth`
 * node); `commands.ts` refuses passing both, so at most one is set here. Left
 * undefined, the transport is auto-detected from the environment.
 *
 * `startLoopback()` is called HERE, not inside `connectOneClick`, and ONLY
 * its failure falls back to device — every failure that can happen once the
 * listener is actually up (denial, timeout, a bad exchange — all of which
 * `connectOneClick` reports via `bail()`, or an unexpected rethrow) is that
 * flow's own and must propagate unchanged, not be mistaken for "the listener
 * never started" and silently rerouted to a different transport with a
 * misleading warning. Loopback forced via `--loopback` never falls back at
 * all: a start failure there is left to propagate as-is.
 */
export async function connectViaOneClick(
  target: ConnectTarget,
  platformUrl: string,
  cwd: string,
  transportOverride: ConnectTransport | undefined,
): Promise<ExchangeResult> {
  const decision = decideTransport({
    forceDevice: transportOverride === "device",
    forceLoopback: transportOverride === "loopback",
  });

  if (decision.transport === "device") {
    return connectByDevice(target, platformUrl, cwd, decision.reason);
  }

  let listener: LoopbackListener;
  try {
    listener = await startLoopback();
  } catch (err) {
    if (transportOverride === "loopback") throw err;
    log.warn(
      `Could not start the local loopback listener (${errorMessage(err)}) — ` +
        "falling back to the device-code flow.",
    );
    return connectByDevice(
      target,
      platformUrl,
      cwd,
      "the loopback listener failed to start",
    );
  }

  return connectOneClick(target, platformUrl, cwd, decision.reason, listener);
}

/** Step 2 (paste branch): the original manual flow — client ID/secret against the DevDogs API. */
async function connectByPasting(
  baseUrlOverride?: string,
): Promise<ExchangeResult> {
  // Not prompted: contributors always want the canonical API. `--base-url` /
  // `OAUTH_BASE_URL` stay as overrides for testing against another project.
  const explicitBase = baseUrlOverride ?? process.env[ENV_KEYS.baseUrl];
  const candidates = explicitBase
    ? [explicitBase.replace(/\/+$/, "")]
    : DEFAULT_API_URLS;

  let clientId = nonEmptyEnv(ENV_KEYS.clientId);
  let clientSecret = nonEmptyEnv(ENV_KEYS.clientSecret);

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
      `1. Visit ${WEBSITE_URL}/settings/oauth\n` +
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

  // Supabase Auth's own OIDC provider refuses to register a custom provider
  // whose declared issuer disagrees with what ITS discovery document
  // reports — and that need not be `${baseUrl}/auth/v1`; Supabase may
  // advertise its project ref host there instead of the custom domain this
  // ran against. Reading the issuer from discovery, rather than assuming
  // it, is what keeps this correct either way — see `discovery.ts`'s
  // header. (The one-click branch skips this entirely: the exchange
  // response carries the issuer directly.)
  const discoverySpinner = spinner();
  discoverySpinner.start("Discovering issuer");
  let issuer: string;
  try {
    ({ issuer } = await fetchIssuerFromAny(candidates));
    discoverySpinner.stop(`Discovered issuer: ${issuer}`);
  } catch (err) {
    discoverySpinner.stop("Could not discover the issuer");
    if (err instanceof DiscoveryError) bail(err.message);
    throw err;
  }

  return { clientId, clientSecret, issuer };
}

/**
 * The wizard. `baseUrlOverride`/`platformUrlOverride`, when given, replace
 * the canonical API and platform URLs (used by "Paste credentials instead"
 * and the one-click flow respectively). `transportOverride` (`--device`/
 * `--loopback`) forces the one-click flow's transport — see
 * `connectViaOneClick` — and is ignored on the "Paste credentials instead"
 * branch, which has no transport of its own.
 *
 * Intro and outro are the caller's, so this composes into the devtools menu
 * without drawing a second box inside the first.
 */
export async function runOAuthSetup(
  baseUrlOverride?: string,
  platformUrlOverride?: string,
  transportOverride?: ConnectTransport,
  /**
   * A target already resolved by a caller — `setup/commands.ts`'s hosted wizard,
   * chaining in with the same project/service-role key a contributor just
   * typed, so they are not asked to pick "hosted" and paste the key a
   * second time. Skips Step 1 entirely when given.
   */
  presetTarget?: ConnectTarget,
  /**
   * Where the credentials are saved, relative to the working directory. A
   * product repo passes its `.env.tooling`; the default is `.env.local`.
   */
  credentialsFile = ".env.local",
): Promise<void> {
  const cwd = process.cwd();

  log.info('Configures a Supabase project to support "Sign in with DevDogs".');

  // ── Step 1: Choose target ────────────────────────────────────────────────

  const target = presetTarget ?? (await chooseTarget(cwd));

  // ── Step 2: Connect ──────────────────────────────────────────────────────

  const providerName = unwrap(
    await text({
      message: "Provider display name",
      initialValue: process.env[ENV_KEYS.providerName] ?? PROVIDER_NAME,
      placeholder: PROVIDER_NAME,
    }),
  );

  const connectMethod = unwrap(
    await select({
      message: "How do you want to connect?",
      options: [
        {
          value: "one-click" as const,
          label: "One-click connect",
          hint: "opens your browser — recommended",
        },
        {
          value: "paste" as const,
          label: "Paste credentials instead",
          hint: "register an OAuth client on the website by hand",
        },
      ],
    }),
  );

  const usedOneClick = connectMethod === "one-click";
  const { clientId, clientSecret, issuer } = usedOneClick
    ? await connectViaOneClick(
        target,
        platformUrlOverride ?? process.env[ENV_KEYS.platformUrl] ?? WEBSITE_URL,
        cwd,
        transportOverride,
      )
    : await connectByPasting(baseUrlOverride);

  // ── Step 3: Configure — resolve the provider identifier, then upsert ──────

  let identifier = PROVIDER_IDENTIFIER;

  {
    const s = spinner();
    s.start(`Checking for existing ${identifier} provider`);
    let existing: { exists: boolean; name?: string };
    try {
      existing = await checkProvider(target, identifier);
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
              hint: `e.g. custom:devdogsuga-staging`,
            },
          ],
        }),
      );

      if (action === "new") {
        const suffix = unwrap(
          await text({
            message: `New identifier suffix — will be registered as "custom:<suffix>"`,
            placeholder: "devdogsuga-staging",
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

  const s = spinner();
  s.start(`Configuring ${identifier}`);
  const row = await upsertDevDogsProvider(target, {
    identifier,
    name: providerName,
    clientId,
    clientSecret,
    issuer,
  });
  s.stop(`Configured ${row.identifier} (issuer: ${row.issuer})`);

  // ── Step 4: Finish — persist to .env.local, print next steps ─────────────

  const envValues: Record<string, string> = {
    [ENV_KEYS.providerName]: providerName,
    [ENV_KEYS.clientId]: clientId,
    // The secret key never rides in a value string that ships to a client —
    // `.env.local` is a server-side/CLI file, never bundled, the same
    // guarantee the original manual flow already carried; this branch adds
    // nothing new to that boundary.
    [ENV_KEYS.clientSecret]: clientSecret,
  };
  // Only an explicit override is remembered: the default is a list of hosts
  // tried in turn, and pinning whichever answered today would outlive it.
  const explicitBase = baseUrlOverride ?? process.env[ENV_KEYS.baseUrl];
  if (!usedOneClick && explicitBase) {
    envValues[ENV_KEYS.baseUrl] = explicitBase;
  }
  upsertEnvLocal(cwd, envValues, credentialsFile);
  log.success(`Credentials saved to ${credentialsFile}`);

  const callbackUri = `${target.apiUrl}/auth/v1/callback`;

  // The one-click flow already told the platform this callback URL as part
  // of `/oauth/connect` (`callback_uri`), so there is nothing left to
  // register by hand. Only the manual "paste credentials" path — which
  // created its OAuth client on the website, where redirect URIs are a
  // separate step — still needs this.
  if (!usedOneClick) {
    const alreadyRegistered = unwrap(
      await confirm({
        message:
          "Have you already registered your Supabase callback URL with DevDogs?",
        initialValue: false,
      }),
    );

    if (!alreadyRegistered) {
      const keysUrl = `${WEBSITE_URL}/settings/oauth?add_redirect_uri=${encodeURIComponent(callbackUri)}`;
      log.info(`Opening ${keysUrl}`);
      openBrowser(keysUrl);
    }

    if (!alreadyRegistered) {
      note(
        `Finish registering your callback URL in the browser that just opened:\n` +
          `   ${callbackUri}`,
        "One more step",
      );
    }
  }

  const redirectStep: string[] =
    target.kind === "hosted"
      ? [
          `Add your app's localhost redirect URL in the dashboard:`,
          `   Auth -> URL Configuration -> Redirect URLs -> add http://localhost:<port>/**`,
          `   (schedule-builder is 3001, platform is 3000)`,
        ]
      : [
          `Make sure your project's supabase/config.toml allows your app callback:`,
          `   additional_redirect_urls = ["http://localhost:<port>/auth/callback"]`,
        ];

  const nextSteps: string[] = [
    ...redirectStep,
    ``,
    `Trigger sign-in from your app:`,
    ``,
    `   await supabase.auth.signInWithOAuth({`,
    `     provider: "${identifier}",`,
    `     options: { redirectTo: \`\${origin}/auth/callback\` },`,
    `   });`,
  ];

  if (target.kind === "local") {
    nextSteps.push(
      ``,
      // The provider row lives in `auth.custom_oauth_providers`, which a
      // plain `supabase stop`/`supabase start` leaves alone — but `supabase
      // db reset` and `supabase stop --no-backup` both erase it along with
      // the rest of the database, silently turning this sign-in button off.
      `Re-run \`devtools oauth\` after \`supabase db reset\` or \`supabase stop --no-backup\` —`,
      `either wipes this provider along with the rest of the local database.`,
    );
  }

  note(nextSteps.join("\n"), "Next steps");
}
