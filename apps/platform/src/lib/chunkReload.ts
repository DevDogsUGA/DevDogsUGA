/**
 * A client component's code that failed to download.
 *
 * Every client component is its own chunk, fetched with `import()` when a
 * page first needs it. When that fetch fails (a flaky connection, a tab left
 * open across a deploy, a proxy or extension cancelling the request), the
 * component throws and the nearest error boundary shows its "did not load"
 * screen, though nothing is wrong with the page itself (Sentry PLATFORM-7:
 * a meeting page lost to its Add to Calendar button's chunk). Loading the
 * page again fetches the chunk again, which is usually all it needs.
 */

/** The messages Chromium, WebKit and Firefox give a failed `import()`. */
const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** Two failures this close together on one page are not a blip. */
const RETRY_WINDOW_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);
}

/**
 * For an error boundary's effect: reloads the page once when `error` is a
 * chunk that failed to load, and returns true when it did, so the boundary
 * neither reports the error nor keeps its screen up. A second failure on the
 * same page within a minute returns false, and the boundary handles it as it
 * would any other error.
 */
export function reloadForChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;
  const key = `chunk-reload:${location.pathname}`;
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < RETRY_WINDOW_MS) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // No sessionStorage (blocked, or a private mode that throws): no way to
    // tell a first failure from a loop, so don't reload.
    return false;
  }
  location.reload();
  return true;
}
