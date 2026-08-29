/**
 * `courses.abbr` is already the fully-qualified course code ("CSCI1302"), so
 * rendering it beside `courseNumber` produces "CSCI1302 1302". Split the number
 * back off for display; anywhere the code is *matched* against the database,
 * use `abbr` on its own.
 */
export function formatCourseCode(
  abbr: string | undefined,
  courseNumber: string | undefined,
): string {
  if (!abbr) return "";
  if (courseNumber && abbr.endsWith(courseNumber)) {
    return `${abbr.slice(0, -courseNumber.length)} ${courseNumber}`;
  }
  return abbr;
}
