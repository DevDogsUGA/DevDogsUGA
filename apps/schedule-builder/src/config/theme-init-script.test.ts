import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_INIT_SCRIPT_HASH } from "./theme-init-script";

/** Same grammar `buildContentSecurityPolicy` and browsers expect. */
async function sha256HashSource(script: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(script),
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // CSP hash sources must be single-quoted in the header value, the same as
  // nonce sources -- a bare `sha256-…` token silently fails to trust the
  // script (confirmed against a real `wrangler dev` response).
  return `'sha256-${base64}'`;
}

describe("THEME_INIT_SCRIPT_HASH", () => {
  it("matches a live SHA-256 hash of THEME_INIT_SCRIPT", async () => {
    // Guards the one place these two can silently drift: `global-error.tsx`
    // can't obtain a per-request nonce (see the doc comment on
    // `THEME_INIT_SCRIPT_HASH`), so it depends on this hash matching the
    // script's exact text byte-for-byte. If someone edits
    // `THEME_INIT_SCRIPT` without updating the hash, this is the test that
    // catches it -- a CSP violation in that one boundary otherwise fails
    // silently (Report-Only) or breaks dark-mode-before-paint (enforcing).
    expect(await sha256HashSource(THEME_INIT_SCRIPT)).toBe(
      THEME_INIT_SCRIPT_HASH,
    );
  });
});
