/**
 * The one row shape every line of the profile popover wears.
 *
 * Lives apart from both components that use it because ProfilePopover renders
 * the plain rows and NavSubMenu renders the sub-menu triggers, and the whole
 * point is that the two are indistinguishable until you reach the caret.
 */
export const POPOVER_ROW =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors outline-none hover:bg-mauve-800 focus:outline-none";

/**
 * The leading slot, ahead of the row's icon, that a sub-menu fills with its
 * caret. Rows that go straight to a page leave it empty rather than dropping
 * it, which is what keeps every label in the popover on one left edge instead
 * of indenting the two rows that happen to open something.
 */
export const POPOVER_ROW_GUTTER = "w-3 shrink-0";

/** The caret itself, sized to fill the gutter exactly. */
export const POPOVER_ROW_CARET = "size-3 shrink-0 text-mauve-400";
