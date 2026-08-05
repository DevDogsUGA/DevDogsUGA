import { NextResponse, connection } from "next/server";
import { CliAuthError, resolveTeamTarget } from "~/server/sandbox/cliAuth";
import { issueCredentials } from "~/server/sandbox/credentials";

/**
 * POST /api/sandbox/link
 *
 * Issues a member their two tokens for their team's environment, and returns
 * the proxy URL to point a checkout at.
 *
 * This is the only endpoint that ever returns token plaintext, and it returns
 * it exactly once — nothing stores it, and a second call issues new tokens
 * rather than recovering the old ones. That is a deliberate cost: a lost token
 * is re-issued in one command, whereas a recoverable one is a secret sitting in
 * a database waiting to be read.
 */
export async function POST(request: Request) {
  await connection();

  try {
    const { slug } = (await request.json()) as { slug?: string };
    if (!slug) {
      return NextResponse.json(
        { code: "bad_request", message: "slug is required" },
        { status: 400 },
      );
    }

    const target = await resolveTeamTarget(request, slug);
    const issued = await issueCredentials(target.environmentId, target.userId);

    const byScope = Object.fromEntries(issued.map((i) => [i.scope, i.token]));

    return NextResponse.json({
      // The PROXY hostname, never the real Supabase URL. Handing over the
      // upstream URL would let a member bypass the proxy entirely, and with it
      // every revocation path and the whole audit trail.
      apiUrl: `https://${target.proxyHostname}`,
      publishableToken: byScope.publishable,
      secretToken: byScope.secret,
      environmentName: target.environmentName,
    });
  } catch (error) {
    if (error instanceof CliAuthError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    console.error("[sandbox] link failed:", error);
    return NextResponse.json({ code: "unknown" }, { status: 500 });
  }
}
