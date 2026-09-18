/**
 * A throwaway HTTP server that catches one OAuth redirect and dies.
 *
 * Entra ignores the port when matching a localhost redirect URI, so the
 * sign-in can come home to `http://localhost:{ephemeral}/` even though
 * Thunderbird registered no port. Bound to 127.0.0.1 only — the redirect
 * never leaves the machine, and nothing off it should reach the listener.
 * The `state` nonce ties the callback to this run: any other process that
 * finds the port cannot feed the flow a code it did not mint.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";

/**
 * What one request to the listener means. `null` is a stray — a favicon
 * probe, a health check — and the server keeps waiting; a wrong or missing
 * state is also a stray, because rejecting the whole sign-in over a request
 * an attacker could send unauthenticated would hand them a denial of
 * service instead.
 */
export function parseCallback(
  requestUrl: string,
  state: string,
): { code: string } | Error | null {
  const url = new URL(requestUrl, "http://localhost");
  if (url.pathname !== "/") return null;
  if (url.searchParams.get("state") !== state) return null;
  const error = url.searchParams.get("error");
  if (error) {
    return new Error(url.searchParams.get("error_description") ?? error);
  }
  const code = url.searchParams.get("code");
  return code ? { code } : null;
}

const LANDING = `<!doctype html>
<meta charset="utf-8">
<title>DevDogs devtools</title>
<body style="font-family: system-ui; display: grid; place-items: center; min-height: 90vh; background: #13121b; color: #f3f1f6">
<p style="max-width: 36rem; text-align: center">%MESSAGE% You can close this tab; the rest happens in the terminal.</p>
`;

export interface Loopback {
  port: number;
  /** Resolves with the code, or rejects with what the identity page said. */
  code: Promise<string>;
  close(): void;
}

/** Throws when it cannot bind, which is the caller's cue to fall back. */
export function startLoopback(state: string): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    // Assigned synchronously by the executor below, which TS cannot see.
    let settle!: { resolve(code: string): void; reject(err: Error): void };
    const code = new Promise<string>((resolveCode, rejectCode) => {
      settle = { resolve: resolveCode, reject: rejectCode };
    });
    // A rejection can land in the gap before the caller awaits; this extra
    // no-op handler marks it handled without eating it for the real awaiter.
    code.catch(() => {});
    const server = createServer((request, response) => {
      const result = parseCallback(request.url ?? "/", state);
      if (result === null) {
        response.writeHead(404).end();
        return;
      }
      const failed = result instanceof Error;
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          LANDING.replace(
            "%MESSAGE%",
            failed ? "The sign-in did not go through." : "Signed in.",
          ),
        );
      if (failed) settle.reject(result);
      else settle.resolve(result.code);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("The loopback server bound without a port."));
        return;
      }
      resolve({
        port: address.port,
        code,
        close: () => server.close(),
      });
    });
  });
}

/**
 * Best effort only: the URL is always printed too, so a machine with no
 * opener — SSH, a container, a WSL distro without wslview — costs one click
 * on the printed line instead of a failure.
 */
export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // The printed URL is the real interface; this was only a convenience.
  }
}
