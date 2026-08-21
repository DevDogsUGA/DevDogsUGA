/**
 * Hand a link to the device's share sheet, falling back to the clipboard.
 *
 * Kept free of React and of any toast so it can be unit-tested against a
 * stubbed `navigator` — the caller decides what, if anything, to say about
 * the outcome.
 */

export interface ShareTarget {
  title: string;
  /** Absolute, or relative to this origin — `"/"` is resolved before sharing. */
  url: string;
}

export type ShareOutcome =
  /** The share sheet opened and the person picked a target. */
  | "shared"
  /** The share sheet opened and the person closed it. Say nothing. */
  | "dismissed"
  /** No share sheet to open, so the link went to the clipboard instead. */
  | "copied"
  /** Neither worked. */
  | "failed";

/**
 * A share sheet needs somewhere to send people, and `"/"` means nothing off
 * this tab. Resolved against the current origin rather than a configured base
 * URL so a link shared from a preview deployment points back at that preview.
 */
function toAbsolute(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export async function shareOrCopy({
  title,
  url,
}: ShareTarget): Promise<ShareOutcome> {
  const data = { title, url: toAbsolute(url) };

  // `canShare` is asked with the real payload: called bare it tests an empty
  // one and always answers false, which is what made the old share button on
  // the listing rows silently do nothing.
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      // Closing the sheet is a decision, not a failure — report neither an
      // error nor a copy the person did not ask for.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "dismissed";
      }
      // Anything else — a share sheet that refuses the payload, or transient
      // activation that expired on the way here — falls through to the
      // clipboard rather than leaving the press with nothing to show.
    }
  }

  try {
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
