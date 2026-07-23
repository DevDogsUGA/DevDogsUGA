import { isBefore } from "date-fns";

export default function isInRange(
  [start, end]: [string | number | Date | null, string | number | Date | null],
  compare: string | number | Date,
) {
  return (
    (!start || isBefore(start, compare)) && (!end || isBefore(compare, end))
  );
}
