import * as Sentry from "@sentry/cloudflare";
import type { NextRequest } from "next/server";

/** Record old CLI callers through the Worker's Sentry client without reading their body. */
export function deprecatedRoute<T>(handler: (request: NextRequest) => T) {
  return (request: NextRequest): T => {
    Sentry.captureMessage("Deprecated CLI OAuth route", {
      level: "info",
      tags: {
        deprecated_route: request.nextUrl.pathname,
        user_agent: request.headers.get("user-agent") ?? "unknown",
      },
    });
    return handler(request);
  };
}
