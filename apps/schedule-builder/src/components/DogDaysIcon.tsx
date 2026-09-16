/**
 * DogDays: a wall calendar with a bone pinned to it, in currentColor.
 *
 * Copied from platform's `ProjectsSection/project-icons.tsx` (the geometry
 * also lives in `@devdogsuga/og`'s `DogDaysMark`, but that variant takes a
 * fixed pixel size and color; this one flows with text). Drawn against Alan
 * Sans' metrics: the viewBox is cropped to the ink with the mark's bottom on
 * the box's bottom edge, so rendered `inline-block h-[0.79em] w-auto
 * align-baseline` inside a line of the display face, the calendar's body
 * stands on the baseline at exactly cap height — the binder tabs rise above
 * the cap line the way an accent would.
 */
export function DogDaysIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="2.5 3.5 43 43"
      width="1em"
      height="1em"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Header band, notched where the tabs pass through it. */}
      <path
        d="M 7.5 9.5 H 11.8 V 13.95 Q 11.8 15.45 13.3 15.45 H 17.7 Q 19.2 15.45 19.2 13.95 V 9.5 H 28.8 V 13.95 Q 28.8 15.45 30.3 15.45 H 34.7 Q 36.2 15.45 36.2 13.95 V 9.5 H 40.5 Q 45.5 9.5 45.5 14.5 V 18.25 H 2.5 V 14.5 Q 2.5 9.5 7.5 9.5 Z"
        fill="currentColor"
      />
      {/* Frame: walls and floor, one stroke wide, butt-ended under the band. */}
      <path
        d="M 5 17.75 V 41.5 Q 5 44 7.5 44 H 40.5 Q 43 44 43 41.5 V 17.75"
        stroke="currentColor"
        strokeWidth="5"
        fill="none"
        strokeLinecap="butt"
      />
      {/* Fillets easing the floor into the walls, inside the frame. */}
      <path
        d="M 40.5 39 Q 40.5 41.5 38 41.5 L 40.5 41.5 Z"
        fill="currentColor"
      />
      <path d="M 7.5 39 Q 7.5 41.5 10 41.5 L 7.5 41.5 Z" fill="currentColor" />
      {/* Binder tabs: round-capped capsules, like Alan Sans arm terminals. */}
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        <line x1="15.5" y1="6" x2="15.5" y2="11.75" />
        <line x1="32.5" y1="6" x2="32.5" y2="11.75" />
      </g>
      {/* The bone, tilted a little so it reads as pinned rather than printed. */}
      <g
        transform="translate(24 29.88) rotate(-14) translate(-24 -27)"
        fill="currentColor"
      >
        <rect x="16.5" y="24.8" width="15" height="4.4" rx="2.2" />
        <circle cx="16.5" cy="24.9" r="3.1" />
        <circle cx="16.5" cy="29.1" r="3.1" />
        <circle cx="31.5" cy="24.9" r="3.1" />
        <circle cx="31.5" cy="29.1" r="3.1" />
      </g>
    </svg>
  );
}
