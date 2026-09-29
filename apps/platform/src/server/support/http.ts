import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ipRateLimitSubject } from "~/server/oauth/ipRateLimitSubject";
import { consumeRateLimit } from "~/server/rateLimit";
import { guestsEnabled, supportConfig, type SupportConfig } from "./config";
import { SupportError } from "./conversations";
import { createGuest, currentVisitor, type Visitor } from "./identity";
import { verifyTurnstile } from "./turnstile";

/**
 * Wraps a support route: 404 when this environment has no widget, and every
 * `SupportError` becomes `{ error }` with its status, so the client has one
 * error shape to show. Anything else is a 500 with the details kept in logs.
 */
export function supportRoute<Ctx>(
  handler: (
    request: NextRequest,
    config: SupportConfig,
    context: Ctx,
  ) => Promise<Response>,
) {
  return async (request: NextRequest, context: Ctx): Promise<Response> => {
    const config = supportConfig();
    if (!config) return new NextResponse(null, { status: 404 });
    try {
      return await handler(request, config, context);
    } catch (error) {
      if (error instanceof SupportError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: error.issues[0]?.message ?? "Invalid request." },
          { status: 400 },
        );
      }
      console.error("[support]", error);
      return NextResponse.json(
        { error: "Something went wrong reaching Discord. Try again in a minute." },
        { status: 502 },
      );
    }
  };
}

export interface Budget {
  scope: string;
  limit: number;
  windowSeconds: number;
}

/** Budgets per visitor. Guests and members share the numbers. */
export const BUDGETS = {
  start: { scope: "support:start", limit: 5, windowSeconds: 60 * 60 },
  reply: { scope: "support:reply", limit: 30, windowSeconds: 10 * 60 },
  follow: { scope: "support:follow", limit: 10, windowSeconds: 60 * 60 },
  /** New guests per IP: the Turnstile pass is per guest, this is per address. */
  guestPerIp: { scope: "support:guest:ip", limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, Budget>;

export async function spend(budget: Budget, subjectId: string): Promise<void> {
  if (!(await consumeRateLimit({ ...budget, subjectId }))) {
    throw new SupportError(429, "You're sending messages too quickly. Try again later.");
  }
}

export function subjectOf(visitor: Visitor): string {
  return visitor.kind === "member" ? visitor.userId : visitor.guestId;
}

/**
 * The visitor, minting a guest if there is none yet. Minting is the one
 * place Turnstile runs: the widget sends a token with the first message a
 * guest posts, and never again.
 */
export async function visitorOrNewGuest(
  request: NextRequest,
  turnstileToken: string | undefined,
): Promise<Visitor> {
  const visitor = await currentVisitor();
  if (visitor) return visitor;

  if (!guestsEnabled()) {
    throw new SupportError(401, "Sign in to ask a question.");
  }
  if (!turnstileToken) {
    throw new SupportError(400, "Complete the check before posting.");
  }
  await spend(BUDGETS.guestPerIp, ipRateLimitSubject(request));
  const ip = request.headers.get("cf-connecting-ip");
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    throw new SupportError(403, "The check failed. Refresh and try again.");
  }
  return createGuest();
}

export async function requireVisitor(): Promise<Visitor> {
  const visitor = await currentVisitor();
  if (!visitor) throw new SupportError(401, "Your session ended. Ask again to continue.");
  return visitor;
}

/** A Discord snowflake from a route segment. */
export const snowflake = z.string().regex(/^\d{17,20}$/, "Unknown conversation.");
