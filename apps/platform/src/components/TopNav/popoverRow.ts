/**
 * The row class every line of the profile popover uses.
 *
 * Shared rather than kept in either component: ProfilePopover renders the plain
 * rows, NavSubMenu renders the sub-menu triggers, and the two have to look
 * identical apart from the glyph they lead with.
 */
export const POPOVER_ROW =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors outline-none hover:bg-mauve-800 focus:outline-none";

/**
 * The caret a sub-menu row leads with, in place of a plain row's icon. It sets
 * no size of its own, so it renders at 1em, the same box a bare Phosphor icon
 * takes. That is what lines the two kinds of row up.
 */
export const POPOVER_ROW_CARET = "shrink-0 text-mauve-400";

/**
 * The hairline between the popover's bands. Inset by the same 1.5 the rows are
 * padded by, so it stops short of the card's edge rather than cutting it.
 */
export const POPOVER_DIVIDER =
  "mx-1.5 my-1.5 h-px w-[calc(100%-var(--spacing)*3)] bg-mauve-700";
