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
  /**
   * The notice itself. One sentence. The text is capped at `max-w-prose`
   * (65ch), so anything past that wraps to a second line rather than
   * running the full width of the card.
   */
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
 * `action.href` is `/leadership`, a next.config redirect onto the form that
 * takes applications. It is `external` despite the leading slash: the path is
 * ours, the page at the end of it is not, so it opens in a new tab and wears
 * the outbound arrow rather than pretending to stay on the site. The homepage's Leadership section carries the same claim
 * behind the same button, so a change to this copy belongs there too — the
 * notice is dismissible and session-scoped, that section is the standing copy
 * that outlives it. See ~/components/LeadershipSection.
 */
export const ANNOUNCEMENT: Announcement | null = {
  id: "leadership-applications-2026",
  eyebrow: "Now open",
  message:
    "Leadership applications for the 2026–27 executive board are open to all students!",
  action: { label: "Apply Now", href: "/leadership", external: true },
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
