import type { EventType } from "~/app/(site)/homeData";

/**
 * The badge a card and a calendar popover both put on an event, and the dot the
 * calendar grid puts under a day. Shared because the card and the popover show
 * the same event moments apart — a label that drifted between the two would
 * read as two different kinds of night.
 */
export const eventBadge: Record<
  EventType,
  { bg: string; text: string; label: string }
> = {
  hackathon: { bg: "bg-cyan-400", text: "text-black", label: "Competition" },
  workshop: { bg: "bg-amber-400", text: "text-black", label: "Workshop" },
  build: { bg: "bg-mauve-800", text: "text-white", label: "Build Session" },
  career: { bg: "bg-emerald-800", text: "text-white", label: "Career" },
};

export const dotColor: Record<EventType, string> = {
  hackathon: "bg-cyan-500",
  workshop: "bg-amber-400",
  build: "bg-mauve-800",
  career: "bg-emerald-700",
};
