import { env } from "~/env";
import { supportConfig } from "~/server/support/config";
import SupportWidget from "./SupportWidget";

/**
 * Mounts the docs support widget, or nothing in an environment without the
 * Discord wiring. Server-side so that check, and the Turnstile sitekey, are
 * settled before anything ships to the browser.
 */
export default function SupportWidgetMount() {
  if (!supportConfig()) return null;
  return <SupportWidget siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />;
}
