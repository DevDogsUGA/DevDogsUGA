/**
 * The loopback HTTP listener the one-click connect flow waits on.
 *
 * `devtools oauth`'s connect flow opens the platform's `/oauth/connect`
 * page in the contributor's browser, and the platform redirects back to a
 * `redirect_uri` of `http://127.0.0.1:<port>/callback` this process itself
 * is listening on — a random, ephemeral port, requested by passing `0` to
 * `listen()`, so two `devtools oauth` runs on the same machine never
 * collide. `127.0.0.1` specifically, not `0.0.0.0`: this must never accept a
 * connection from anything but the browser running ON this machine.
 *
 * Every exit path — success, `error=access_denied` (or any other `error=`),
 * a request with neither, and the 5-minute timeout — closes the server
 * exactly once. That is the one invariant every caller of `start()` may
 * lean on: `close()` (also exposed for a caller that gives up early, e.g.
 * Ctrl-C) is always safe to call more than once, and the server is never
 * left listening after `result` settles.
 */
import { createServer, type Server } from "node:http";

/** Default: as long as this repo's OAuth wizard reasonably keeps a browser tab open unattended. */
export const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60_000;

/** A successful `?code=...&state=...` callback. */
export interface CallbackSuccess {
  code: string;
  state: string;
}

/** The platform denied the request, or reported some other OAuth `error=`. */
export class CallbackDeniedError extends Error {
  constructor(
    readonly errorCode: string,
    readonly state: string | undefined,
    description?: string,
  ) {
    super(description ? `${errorCode}: ${description}` : errorCode);
    this.name = "CallbackDeniedError";
  }
}

/** No callback arrived within the timeout — the browser was never opened, or the tab was abandoned. */
export class CallbackTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `No response from the browser after ${Math.round(timeoutMs / 1000)}s. ` +
        "Run the command again, and complete the connection in the browser tab it opens.",
    );
    this.name = "CallbackTimeoutError";
  }
}

/** The callback hit `/callback` but had neither `code` nor `error` — not a shape this flow expects. */
export class CallbackMalformedError extends Error {
  constructor() {
    super("The browser's callback had neither a code nor an error.");
    this.name = "CallbackMalformedError";
  }
}

/**
 * The callback's `state` did not match the one this run generated (see
 * `pkce.ts`'s `generateState`) — the defining CSRF defense of this whole
 * flow. Any mismatch is treated the same regardless of cause (a stale tab
 * from a previous run, a forged callback, or a bug): refuse and say so,
 * never silently proceed with the wrong request.
 */
export class StateMismatchError extends Error {
  constructor() {
    super(
      "The browser's callback carried a different state than this run generated " +
        "— the connection may have been tampered with. Run the command again.",
    );
    this.name = "StateMismatchError";
  }
}

/** Throws `StateMismatchError` unless `callback.state` matches `expected`; returns `callback` unchanged otherwise. */
export function verifyState(
  expected: string,
  callback: CallbackSuccess,
): CallbackSuccess {
  if (callback.state !== expected) throw new StateMismatchError();
  return callback;
}

export interface LoopbackListener {
  /** The port `listen(0, ...)` picked. */
  port: number;
  /** `http://127.0.0.1:<port>/callback` — pass this as the connect URL's `redirect_uri`. */
  redirectUri: string;
  /** Resolves on a successful callback; rejects on denial, malformed callback, or timeout. Always settles exactly once. */
  result: Promise<CallbackSuccess>;
  /** Closes the listener immediately. Safe to call more than once, and safe to call after `result` has already settled. */
  close: () => void;
}

function renderCallbackPage(heading: string, body: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>DevDogs devtools</title></head>' +
    `<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; text-align: center;">` +
    `<h1>${heading}</h1><p>${body}</p></body></html>`
  );
}

const SUCCESS_PAGE = renderCallbackPage(
  "Connected",
  "You can close this tab and return to your terminal.",
);
const DENIED_PAGE = renderCallbackPage(
  "Connection not completed",
  "You can close this tab and return to your terminal.",
);

/**
 * Starts the listener and resolves once it is actually accepting
 * connections (i.e. once the real port is known). `result` is the separate
 * promise that settles once a callback (or the timeout) has been handled —
 * most callers `await start(...)` once, then `await listener.result`.
 */
export function start(
  opts: { timeoutMs?: number } = {},
): Promise<LoopbackListener> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;

  return new Promise((resolveListener, rejectListener) => {
    let settled = false;
    let resolveResult!: (value: CallbackSuccess) => void;
    let rejectResult!: (err: Error) => void;
    const result = new Promise<CallbackSuccess>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });
    // `result` settles the instant the callback request arrives, which can
    // be before the caller gets around to `await`ing it (e.g. this
    // function's own `start(...)` promise has to resolve first). Node
    // reports an unhandled rejection for any promise that goes a full
    // microtask turn with no listener at all, even one a caller attaches
    // moments later — this dummy handler exists purely to be that first
    // listener; it does not consume the rejection for real callers, who
    // still get their own `await`/`.catch` on the same promise.
    result.catch(() => undefined);

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? undefined;
      const error = url.searchParams.get("error");

      if (error) {
        res
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end(DENIED_PAGE);
        settle(() =>
          rejectResult(
            new CallbackDeniedError(
              error,
              state,
              url.searchParams.get("error_description") ?? undefined,
            ),
          ),
        );
        return;
      }

      if (!code || !state) {
        res
          .writeHead(400, { "content-type": "text/html; charset=utf-8" })
          .end(DENIED_PAGE);
        settle(() => rejectResult(new CallbackMalformedError()));
        return;
      }

      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(SUCCESS_PAGE);
      settle(() => resolveResult({ code, state }));
    });

    const timer = setTimeout(() => {
      settle(() => rejectResult(new CallbackTimeoutError(timeoutMs)));
    }, timeoutMs);
    // Never keep the process alive on this timer alone — a caller that
    // already got its result (or gave up and called close()) must be able
    // to exit immediately.
    timer.unref();

    const close = (): void => {
      clearTimeout(timer);
      server.close();
    };

    /** Runs `settleFn` exactly once, always closing the listener. */
    function settle(settleFn: () => void): void {
      if (settled) return;
      settled = true;
      settleFn();
      close();
    }

    server.once("error", (err) => {
      if (!settled) {
        settled = true;
        rejectListener(err);
        return;
      }
      // An error after the listener already started (e.g. a second request
      // racing the close()) has nowhere useful to go; `result` already
      // settled, so this is not the caller's problem.
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      resolveListener({
        port,
        redirectUri: `http://127.0.0.1:${port}/callback`,
        result,
        close,
      });
    });
  });
}
