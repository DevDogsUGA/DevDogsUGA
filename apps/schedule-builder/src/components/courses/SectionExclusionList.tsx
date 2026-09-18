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
            className="hover:border-edge hover:bg-surface flex cursor-pointer items-center gap-3 rounded-md border border-transparent p-2"
          >
            <input
              type="checkbox"
              checked={included}
              onChange={() => onToggle(o.crn)}
              className="form-checkbox border-edge-strong text-accent focus:ring-primary size-5 rounded"
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">CRN {o.crn}</span> — {instructor}
            </span>
            <span className="text-muted text-xs">{o.seatsAvailable} seats</span>
          </label>
        );
      })}
    </div>
  );
}
