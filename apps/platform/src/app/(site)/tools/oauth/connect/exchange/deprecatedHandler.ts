import { POST as handler } from "~/app/(auth)/oauth/connect/exchange/route";
import { deprecatedRoute } from "~/server/oauth/deprecatedRoute";

/** Keep the retired endpoint's telemetry separate from the current handler. */
export const POST = deprecatedRoute(handler);
