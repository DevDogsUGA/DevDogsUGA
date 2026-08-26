/**
 * The one row shape every line of the profile popover wears.
 *
 * Lives apart from both components that use it because ProfilePopover renders
 * the plain rows and NavSubMenu renders the sub-menu triggers, and the whole
 * point is that the two are indistinguishable but for the glyph they lead with.
 */
export const POPOVER_ROW =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors outline-none hover:bg-mauve-800 focus:outline-none";

/**
 * The caret a sub-menu row leads with, in place of the icon a plain row leads
 * with. It carries no size of its own so it renders at 1em, exactly the box a
 * bare Phosphor icon takes, which is what lines the two kinds of row up.
 */
export const POPOVER_ROW_CARET = "shrink-0 text-mauve-400";

/**
 * The hairline between the popover's bands. Inset by the same 1.5 the rows are
 * padded by, so it stops short of the card's edge rather than cutting it.
 */
export const POPOVER_DIVIDER =
  "mx-1.5 my-1.5 h-px w-[calc(100%-var(--spacing)*3)] bg-mauve-700";
