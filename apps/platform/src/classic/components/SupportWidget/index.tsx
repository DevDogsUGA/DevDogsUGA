import { env } from "~/env";
import { getDocsProjects } from "~/server/docs/queries";
import { supportConfig } from "~/server/support/config";
import SupportWidget from "./SupportWidget";

/**
 * Mounts the docs support widget, or nothing in an environment without the
 * Discord wiring. Server-side so that check, and the Turnstile sitekey, are
 * settled before anything ships to the browser. Each project's platforms go
 * along so a question is tagged with the platform its page is showing.
 */
export default function SupportWidgetMount() {
  if (!supportConfig()) return null;
  return (
    <SupportWidget
      siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      projectPlatforms={Object.fromEntries(
        getDocsProjects().map((p) => [p.slug, p.os]),
      )}
    />
  );
}
