/**
 * The device-code fallback for the one-click connect flow (TASK-352): for a
 * contributor whose terminal cannot open a browser tab that can complete a
 * loopback redirect back to THIS machine — SSH, a Codespace, a dev container,
 * or any environment where the loopback listener itself fails to start (see
 * `transport.ts`) — this trades a short user code, approved in a browser
 * running anywhere, for the same OAuth client credentials `exchange.ts`
 * hands back. The server side of this (TASK-352) lives in the DevDogsUGA
 * repo, at `apps/platform/src/app/(auth)/oauth/device/` — this is the
 * fixed wire contract the two sides agreed on:
 *
 *   POST <platform>/oauth/device/code
 *   { "label", "callback_uri" }
 *
 *   200 { "device_code", "user_code", "verification_uri",
 *         "verification_uri_complete", "expires_in", "interval" }
 *   400 { "error": "invalid_request", "error_description" }
 *   429 { "error": "rate_limited" }  (+ Retry-After header)
 *
 *   POST <platform>/oauth/device/token
 *   { "device_code" }
 *
 *   200 { "client_id", "client_secret", "issuer" }
 *   400 { "error": "authorization_pending" | "slow_down" | "access_denied" |
 *                   "expired_token" | "invalid_grant" | "invalid_request",
 *         "error_description" }
 *   429 { "error": "rate_limited" }  (+ Retry-After header)
 *
 * `requestDeviceCode` mints the code; `pollForToken` polls `.../token` on
 * the server's own cadence until it settles one way or the other. Both take
 * an injectable `fetchImpl` so tests never touch the network, and
 * `pollForToken` additionally takes injectable `sleep`/`now` so tests never
 * touch the wall clock either.
 */
import type { ExchangeResult } from "./exchange.js";

export type DeviceErrorKind =
  "invalid_request" | "rate_limited" | "network" | "malformed";

export class DeviceError extends Error {
  constructor(
    readonly kind: DeviceErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "DeviceError";
  }
}

export interface DeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

/** The `/token` endpoint's terminal (non-retryable) outcomes, plus `network`/`malformed`. */
export type PollErrorKind =
  | "access_denied"
  | "expired_token"
  | "invalid_grant"
  | "invalid_request"
  | "network"
  | "malformed";

export class PollError extends Error {
  constructor(
    readonly kind: PollErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PollError";
  }
}

function deviceCodeUrl(platformUrl: string): string {
  return `${platformUrl.replace(/\/+$/, "")}/oauth/device/code`;
}

function deviceTokenUrl(platformUrl: string): string {
  return `${platformUrl.replace(/\/+$/, "")}/oauth/device/token`;
}

function retryAfterSecondsFrom(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : undefined;
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * Requests a device code. Mirrors `exchange.ts`'s `exchangeCode` in shape:
 * every failure is a distinct `DeviceError` kind, a 429 carries
 * `Retry-After` when the platform sent one, and a 200 whose body is not
 * valid JSON or is missing a required field is `malformed` rather than
 * handing the caller `undefined` fields.
 */
export async function requestDeviceCode({
  platformUrl,
  label,
  callbackUri,
  fetchImpl = fetch,
}: {
  platformUrl: string;
  label: string;
  callbackUri: string;
  fetchImpl?: typeof fetch;
}): Promise<DeviceCodeResult> {
  const url = deviceCodeUrl(platformUrl);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, callback_uri: callbackUri }),
    });
  } catch (err) {
    throw new DeviceError(
      "network",
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 429) {
    const retryAfterSeconds = retryAfterSecondsFrom(response);
    throw new DeviceError(
      "rate_limited",
      `${url} is rate-limited` +
        (retryAfterSeconds !== undefined
          ? ` — retry after ${retryAfterSeconds}s.`
          : "."),
      retryAfterSeconds,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DeviceError(
      "malformed",
      `${url} did not return valid JSON (status ${response.status}).`,
    );
  }

  if (!response.ok) {
    const errBody = (body ?? {}) as {
      error?: unknown;
      error_description?: unknown;
    };
    const description =
      typeof errBody.error_description === "string"
        ? errBody.error_description
        : undefined;
    const code =
      typeof errBody.error === "string"
        ? errBody.error
        : `HTTP ${response.status}`;
    throw new DeviceError(
      "invalid_request",
      description ? `${code}: ${description}` : code,
    );
  }

  const result = (body ?? {}) as {
    device_code?: unknown;
    user_code?: unknown;
    verification_uri?: unknown;
    verification_uri_complete?: unknown;
    expires_in?: unknown;
    interval?: unknown;
  };
  if (
    typeof result.device_code !== "string" ||
    typeof result.user_code !== "string" ||
    typeof result.verification_uri !== "string" ||
    typeof result.verification_uri_complete !== "string" ||
    typeof result.expires_in !== "number" ||
    typeof result.interval !== "number"
  ) {
    throw new DeviceError(
      "malformed",
      `${url} returned 200 but was missing a required device-code field.`,
    );
  }

  return {
    deviceCode: result.device_code,
    userCode: result.user_code,
    verificationUri: result.verification_uri,
    verificationUriComplete: result.verification_uri_complete,
    expiresIn: result.expires_in,
    interval: result.interval,
  };
}

/** Network failures while polling get this many retries before `pollForToken` gives up. */
const MAX_NETWORK_RETRIES = 3;

/** Exponential backoff for a network retry, capped well under the poll interval's own cadence. */
function networkBackoffSeconds(attempt: number): number {
  return Math.min(2 ** attempt, 30);
}

/**
 * Polls `.../oauth/device/token` on the server's cadence until the
 * user approves (or denies) the request in their browser, the device code
 * expires, or the server rejects it outright.
 *
 * `authorization_pending` keeps polling at the current interval;
 * `slow_down` adds 5 seconds to it and keeps polling (per the wire
 * contract); a 429 waits out `Retry-After` (or the current interval, if the
 * platform sent none) and keeps polling; every other error is terminal.
 * Local expiry (`now() - start >= expiresInSeconds`) is reported the same
 * way as the server's own `expired_token` — the caller does not need to
 * tell the two apart.
 *
 * A network failure while polling retries with backoff up to
 * `MAX_NETWORK_RETRIES` times before it is reported as `PollError("network")`.
 */
export async function pollForToken({
  platformUrl,
  deviceCode,
  intervalSeconds,
  expiresInSeconds,
  fetchImpl = fetch,
  sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}: {
  platformUrl: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<ExchangeResult> {
  const url = deviceTokenUrl(platformUrl);
  const deadline = now() + expiresInSeconds * 1000;
  let interval = intervalSeconds;
  let networkFailures = 0;
  // Set only by a branch that already slept its own wait (a network retry's
  // backoff, or a 429's Retry-After) — skips the ordinary top-of-loop
  // interval sleep so those waits are not doubled up with it.
  let skipIntervalSleep = false;

  while (true) {
    if (now() >= deadline) {
      throw new PollError(
        "expired_token",
        "The device code expired before it was approved. Run the command again.",
      );
    }

    if (!skipIntervalSleep) await sleep(interval * 1000);
    skipIntervalSleep = false;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (err) {
      networkFailures += 1;
      if (networkFailures > MAX_NETWORK_RETRIES) {
        throw new PollError(
          "network",
          `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await sleep(networkBackoffSeconds(networkFailures) * 1000);
      skipIntervalSleep = true;
      continue;
    }
    networkFailures = 0;

    if (response.status === 429) {
      const retryAfterSeconds = retryAfterSecondsFrom(response);
      await sleep((retryAfterSeconds ?? interval) * 1000);
      skipIntervalSleep = true;
      continue;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PollError(
        "malformed",
        `${url} did not return valid JSON (status ${response.status}).`,
      );
    }

    if (response.ok) {
      const result = (body ?? {}) as {
        client_id?: unknown;
        client_secret?: unknown;
        issuer?: unknown;
      };
      if (
        typeof result.client_id !== "string" ||
        typeof result.client_secret !== "string" ||
        typeof result.issuer !== "string"
      ) {
        throw new PollError(
          "malformed",
          `${url} returned 200 but was missing client_id, client_secret, or issuer.`,
        );
      }
      return {
        clientId: result.client_id,
        clientSecret: result.client_secret,
        issuer: result.issuer,
      };
    }

    const errBody = (body ?? {}) as {
      error?: unknown;
      error_description?: unknown;
    };
    const errorCode =
      typeof errBody.error === "string" ? errBody.error : undefined;
    const description =
      typeof errBody.error_description === "string"
        ? errBody.error_description
        : undefined;

    switch (errorCode) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval += 5;
        continue;
      case "access_denied":
        throw new PollError(
          "access_denied",
          description ?? "Connection declined in the browser.",
        );
      case "expired_token":
        throw new PollError(
          "expired_token",
          description ?? "The device code expired. Run the command again.",
        );
      case "invalid_grant":
        throw new PollError("invalid_grant", description ?? "invalid_grant");
      case "invalid_request":
      default: {
        const code = errorCode ?? `HTTP ${response.status}`;
        throw new PollError(
          "invalid_request",
          description ? `${code}: ${description}` : code,
        );
      }
    }
  }
}
