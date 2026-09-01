/**
 * The two app marks, redrawn as tintable JSX.
 *
 * `public/brand/dogdays.svg` and `dogpack.svg` exist and hold the same
 * geometry, but each is painted a fixed colour, and an app icon needs the mark
 * in black on its own saturated ground — the rule the switcher tiles already
 * follow in `config/projects.ts`. Carrying the paths here rather than the files
 * is what makes `color` the caller's decision.
 *
 * Geometry is verbatim from `ProjectsSection/project-icons.tsx`. It is drawn
 * against Alan Sans' metrics — 0.15em strokes, round-capped terminals, square
 * outer corners — so the marks sit in a line of the club's display face as a
 * letter would.
 */

/** DogDays: a wall calendar with a bone pinned to it. */
export function DogDaysMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="2.5 3.5 43 43">
      {/* Header band, notched where the tabs pass through it. */}
      <path
        d="M 7.5 9.5 H 11.8 V 13.95 Q 11.8 15.45 13.3 15.45 H 17.7 Q 19.2 15.45 19.2 13.95 V 9.5 H 28.8 V 13.95 Q 28.8 15.45 30.3 15.45 H 34.7 Q 36.2 15.45 36.2 13.95 V 9.5 H 40.5 Q 45.5 9.5 45.5 14.5 V 18.25 H 2.5 V 14.5 Q 2.5 9.5 7.5 9.5 Z"
        fill={color}
      />
      {/* Frame: walls and floor, one stroke wide, butt-ended under the band. */}
      <path
        d="M 5 17.75 V 41.5 Q 5 44 7.5 44 H 40.5 Q 43 44 43 41.5 V 17.75"
        stroke={color}
        strokeWidth="5"
        fill="none"
        strokeLinecap="butt"
      />
      {/* Fillets easing the floor into the walls, inside the frame. */}
      <path d="M 40.5 39 Q 40.5 41.5 38 41.5 L 40.5 41.5 Z" fill={color} />
      <path d="M 7.5 39 Q 7.5 41.5 10 41.5 L 7.5 41.5 Z" fill={color} />
      {/* Binder tabs: round-capped capsules, like Alan Sans arm terminals. */}
      <g stroke={color} strokeWidth="5" strokeLinecap="round">
        <line x1="15.5" y1="6" x2="15.5" y2="11.75" />
        <line x1="32.5" y1="6" x2="32.5" y2="11.75" />
      </g>
      {/* The bone, tilted a little so it reads as pinned rather than printed. */}
      <g
        transform="translate(24 29.88) rotate(-14) translate(-24 -27)"
        fill={color}
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

/** DogPack: one bold paw, four pads gathered around a center. */
export function DogPackMark({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="5.07 9.42 37.86 31.18"
      fill={color}
    >
      <path d="M 24 24.6 C 28.6 24.6 34 26.8 34.8 31.6 C 35.5 36.4 30.8 40.6 24 40.6 C 17.2 40.6 12.5 36.4 13.2 31.6 C 14 26.8 19.4 24.6 24 24.6 Z" />
      <ellipse cx="18" cy="15" rx="4.4" ry="5.6" transform="rotate(-8 18 15)" />
      <ellipse cx="30" cy="15" rx="4.4" ry="5.6" transform="rotate(8 30 15)" />
      <ellipse
        cx="9.6"
        cy="22.6"
        rx="4.2"
        ry="5.4"
        transform="rotate(-30 9.6 22.6)"
      />
      <ellipse
        cx="38.4"
        cy="22.6"
        rx="4.2"
        ry="5.4"
        transform="rotate(30 38.4 22.6)"
      />
    </svg>
  );
}
