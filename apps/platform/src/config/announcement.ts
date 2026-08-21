/**
 * The site-wide announcement banner.
 *
 * Editing this file is the whole workflow. Describe the notice in
 * `ANNOUNCEMENT` and it appears as a card fixed to the bottom of the
 * viewport on every public page; set `ANNOUNCEMENT` to `null` and it stops
 * rendering entirely — no markup, no script, nothing left in the HTML.
 */

export type AnnouncementTone = "urgent" | "info";

export interface Announcement {
  /**
   * Identity of *this* notice, and the value written to session storage when
   * someone dismisses it. Rewriting the copy in place leaves everyone who
   * already dismissed the old notice staring at nothing, so bump the id
   * whenever it becomes a different announcement. Leave it alone for a
   * typo fix — that is the same announcement, and people who waved it away
   * should not have it waved back at them.
   */
  id: string;
  /** Two or three words, set in a chip ahead of the message. */
  eyebrow: string;
  /** The notice itself. One sentence — the card is one line on desktop. */
  message: string;
  /** The thing to go do about it. A notice with no action is just noise. */
  action: {
    label: string;
    href: string;
    /** Opens in a new tab and swaps the arrow for an outbound icon. */
    external?: boolean;
  };
  /**
   * `urgent` is the amber card with the rose chip; `info` is the cooler sky
   * one. Both are near-black-on-bright against a near-black site, so the tone
   * picks the mood rather than how loud the notice is.
   */
  tone: AnnouncementTone;
}

/**
 * Where the dismissal is remembered. Session storage, not local storage, so
 * the notice comes back the next time the tab is opened — a club-wide notice
 * that a member silences once and forever is a notice nobody reads.
 */
export const ANNOUNCEMENT_STORAGE_KEY = "devdogs:announcementDismissed";

/**
 * Route prefixes the notice stays off. Everything under `(site)` carries it
 * except these: the signed-in console, account, and team surfaces, where a
 * club-wide notice is noise stacked on top of a working tool. `/oauth` is a
 * third-party consent screen — nothing of ours belongs in that frame at all.
 */
const NON_PUBLIC_PREFIXES = [
  "/account",
  "/console",
  "/oauth",
  "/teams",
  "/tools",
  "/vote",
];

/**
 * The live notice, or `null` for none.
 *
 * ⚠️ `action.href` points at the Leadership section of the homepage because
 * that is the truthful destination today. Point it at the application form the
 * moment one exists — a notice whose button does less than the notice
 * promises is worse than no notice.
 */
export const ANNOUNCEMENT: Announcement | null = {
  id: "leadership-applications-2026",
  eyebrow: "Now open",
  message:
    "Leadership applications for the 2026–27 executive board are open to every active member.",
  action: { label: "Apply now", href: "/#leadership" },
  tone: "urgent",
};

/** Whether the notice belongs on the page currently being rendered. */
export function showsAnnouncement(pathname: string | null): boolean {
  if (!ANNOUNCEMENT) return false;

  // A prerendered shell can hand a client component a null pathname before the
  // router resolves. Public pages are the overwhelming majority, so default to
  // showing: the worst case is a notice that blinks off on a console route,
  // rather than one that never renders into static HTML at all.
  if (pathname === null) return true;

  return !NON_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
