import type { OfferingSearchRow } from "~/types/course";

export function SectionExclusionList({
  offerings,
  excludedCrns,
  onToggle,
}: {
  offerings: OfferingSearchRow[];
  excludedCrns: Set<number>;
  onToggle: (crn: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {offerings.map((o) => {
        const included = !excludedCrns.has(o.crn);
        const instructor = o.lastName
          ? `${o.firstName ?? ""} ${o.lastName}`.trim()
          : "Staff";
        return (
          <label
            key={o.crn}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent p-2 hover:border-neutral-200 hover:bg-white"
          >
            <input
              type="checkbox"
              checked={included}
              onChange={() => onToggle(o.crn)}
              className="form-checkbox size-5 rounded border-stone-300 text-red-700 focus:ring-red-700"
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">CRN {o.crn}</span> — {instructor}
            </span>
            <span className="text-xs text-neutral-400">
              {o.seatsAvailable} seats
            </span>
          </label>
        );
      })}
    </div>
  );
}
