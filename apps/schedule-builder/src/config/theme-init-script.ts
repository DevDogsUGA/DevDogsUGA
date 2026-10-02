/**
 * Sets `.dark` before first paint so a stored theme choice (or the system
 * preference) never flashes the wrong scheme. Shared between `app/layout.tsx`
 * (a Server Component, which reads the real per-request nonce via
 * `headers()`) and `app/global-error.tsx` (a `"use client"` component, the
 * App Router's required shape for that file, with no `headers()` access) so
 * the two inline `<script>` tags stay byte-identical -- that identity is
 * exactly what lets `global-error.tsx` earn CSP trust through
 * `THEME_INIT_SCRIPT_HASH` instead of a nonce it cannot obtain. See
 * `scheduleBuilderCsp` in `~/config/csp.ts`.
 */
export const THEME_INIT_SCRIPT = `(()=>{try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/**
 * `'sha256-…'` CSP hash source of {@link THEME_INIT_SCRIPT}'s exact text,
 * base64-encoded per the CSP3 hash-source grammar
 * (https://www.w3.org/TR/CSP3/#grammardef-hash-source). Hardcoded rather
 * than computed at runtime -- `buildContentSecurityPolicy` is synchronous
 * and this workspace's edge/Workers runtimes don't all guarantee a
 * synchronous digest API -- and checked against a live recomputation in
 * `theme-init-script.test.ts`, which fails the build the moment the two
 * drift.
 */
export const THEME_INIT_SCRIPT_HASH =
  "'sha256-Qv2trADESYMMlHTyypa8WNNGyjr7StGelJ5FhcqMd0w='";
