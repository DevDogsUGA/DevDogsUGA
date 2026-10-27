/**
 * The six event categories the redesign colours by (`data-kind` in cosmic.css,
 * `KIND` in the SDK palette). DevDogs red is the brand pair beside them, never
 * a category.
 */
export const EVENT_CATEGORIES = [
  "build",
  "workshop",
  "social",
  "info",
  "study",
  "milestone",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** The chip text for each category. */
export const CATEGORY_LABEL: Record<EventCategory, string> = {
  build: "Build",
  workshop: "Workshop",
  social: "Social",
  info: "Info Session",
  study: "Study",
  milestone: "Milestone",
};

/**
 * What `categoryOf` reads from a meeting. Structural, so a loader row, a
 * calendar entry or a bare literal all fit.
 */
export interface CategorisableMeeting {
  category: string | null;
}

/**
 * D12: the one mapping from a meeting to its category.
 *
 * The category is resolved in config (the meeting's own, else its series')
 * and written by reconcile, so this only reads it. A row reconcile has not
 * yet rewritten (null) or an unknown value is a build night, the same
 * fallback the old kind table used.
 */
export function categoryOf(meeting: CategorisableMeeting): EventCategory {
  const category = meeting.category;
  return category !== null &&
    (EVENT_CATEGORIES as readonly string[]).includes(category)
    ? (category as EventCategory)
    : "build";
}
