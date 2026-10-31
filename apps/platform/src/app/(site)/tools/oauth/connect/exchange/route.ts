/**
 * Compatibility for installed CLIs posting to `/tools/oauth/connect/exchange`.
 * Delete once telemetry shows no callers (Q8). Re-export without redirecting
 * so the request body reaches the handler unchanged.
 */
export { POST } from "./deprecatedHandler";
