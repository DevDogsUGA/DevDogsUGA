import { BUILDING_NAME } from "./buildings";
import type { BuildingKey } from "./campusMapMeta";

/**
 * The dialog's heading and blurb, in a plain module because both a client
 * component (the dialog) and a server one (the full /events/directions page)
 * print them — a string exported from a "use client" file reaches a server
 * component as a client reference, not a string.
 *
 * They are functions now rather than constants, because the dialog no longer
 * only ever describes the DLW. The old blurb asserted that "every event
 * happens in DLW 124", which was true when the only building the map could
 * draw was that one, and is exactly the sort of sentence that stays on a page
 * long after it stopped being true.
 */
export const FIND_US_TITLE = "How to find us";

/** Where this meeting is, in the sentence under the dialog's title. */
export function findUsBlurb(
  building: BuildingKey,
  room: string | null,
): string {
  const where =
    room === null
      ? BUILDING_NAME[building]
      : `${room} in ${BUILDING_NAME[building]}`;
  return building === "DLW"
    ? `Most DevDogs events happen in ${where} — the new dining, learning and well-being centre on West Campus.`
    : `This one is in ${where}.`;
}
