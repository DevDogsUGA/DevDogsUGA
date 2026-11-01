import { POST as handler } from "~/app/(auth)/oauth/device/code/route";
import { deprecatedRoute } from "~/server/oauth/deprecatedRoute";

/** Keep the retired endpoint's telemetry separate from the current handler. */
export const POST = deprecatedRoute(handler);
