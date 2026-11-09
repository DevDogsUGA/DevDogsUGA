/**
 * The switcher's button, shared by the listing rows and the app tiles: a
 * thick rim lighter than the fill, so it reads against the
 * black overlay, and a block shadow only on hover, as the row lifts.
 * Spacing is the caller's: the app tiles pack tighter on phones.
 */
export const ROW = "relative flex items-center rounded-sm border-2 text-white";

/** The plain (mauve) colors; featured listing rows swap in emerald. */
export const PLAIN = "border-mauve-600 bg-mauve-900 shadow-mauve-500";
export const PLAIN_HOVER = "hover:border-mauve-300";

/** The lift, for rows that go somewhere. */
export const LIFT =
  "group cursor-pointer transition-lift hover:shadow-block-md hover:-translate-x-0.5 hover:-translate-y-0.5";
