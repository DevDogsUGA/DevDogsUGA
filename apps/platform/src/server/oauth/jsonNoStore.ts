import { NextResponse } from "next/server";

/**
 * Every `devtools oauth` JSON endpoint (connect exchange, both device-code
 * routes) responds `Cache-Control: no-store` -- none of these bodies, which
 * range from client secrets to authorization state, may sit in any cache.
 */
export function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
