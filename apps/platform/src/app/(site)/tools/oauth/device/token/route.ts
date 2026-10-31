/**
 * Compatibility for installed CLIs posting to `/tools/oauth/device/token`.
 * Delete once telemetry shows no callers (Q8). Re-export without redirecting
 * so the request body reaches the handler unchanged.
 *
 * Deliberately not wrapped in `deprecatedRoute`: the CLI polls this endpoint
 * every few seconds while it waits for approval, so recording each poll would
 * flood Sentry. Every old-CLI device flow starts at `/tools/oauth/device/code`,
 * which is recorded, so nothing is lost by leaving this one quiet.
 */
export { POST } from "~/app/(auth)/oauth/device/token/route";
