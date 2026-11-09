import { CATEGORY_LABEL, categoryOf } from "~/lib/eventKind";
export const CHIP_CLS =
  "rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase";
export function meetingBadges(meeting: { category: string | null }) {
  const category = categoryOf(meeting);
  return [
    {
      label: CATEGORY_LABEL[category],
      bg: category === "workshop" ? "bg-emerald-400" : "bg-amber-400",
      text: "text-black",
    },
  ];
}
