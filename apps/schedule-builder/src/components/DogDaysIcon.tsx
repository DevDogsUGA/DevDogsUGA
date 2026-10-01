import { DOGDAYS_MARK, markBody } from "@devdogsuga/brand/marks";

/**
 * DogDays: a wall calendar with a bone pinned to it, in currentColor.
 *
 * The geometry is `@devdogsuga/brand/marks`' (the same drawing as `DogDaysMark`,
 * which takes a fixed pixel size and color; this one flows with text). Drawn
 * against Alan Sans' metrics: the viewBox is cropped to the ink with the mark's
 * bottom on the box's bottom edge, so rendered `inline-block h-[0.799em] w-auto
 * align-baseline` inside a line of the display face, the calendar's body
 * stands on the baseline at exactly cap height -- the binder tabs rise above
 * the cap line the way an accent would. The body (header-band top to frame
 * bottom) is 37 of the box's 43 units, and Alan Sans' measured cap height is
 * 0.6875em, so the box wants 0.6875 x 43/37 = 0.799em -- the "D" of a lockup
 * and the calendar share their top and bottom edges.
 */
export function DogDaysIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox={DOGDAYS_MARK.viewBox}
      width="1em"
      height="1em"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: markBody("dogdays") }}
    />
  );
}
