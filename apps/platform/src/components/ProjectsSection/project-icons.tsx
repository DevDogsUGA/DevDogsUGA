import type { ProjectIconName } from "~/config/projects";

/**
 * Hand-drawn marks for the DevDogs apps, matched to Alan Sans at the bold
 * weight the cards set their titles in: strokes ~0.15em thick (the font's
 * 700-weight stems measure 0.163em, its bars 0.14em), round-capped terminals
 * like the font's arm endings, and square-shouldered outer corners like its
 * stem strips. Both render in currentColor so whatever tints the text around
 * them tints the mark.
 *
 * They take the same props the Phosphor icons in ~/config/icons do, and
 * default to the same 1em box, so a tile or a menu row can hold either
 * without knowing which it got. `weight` is accepted and ignored: the marks
 * have one weight, the font's.
 *
 * Each viewBox is cropped to the ink, with the bottom edge of the mark on the
 * bottom edge of the box. Set only a height in em and let the width follow,
 * and the mark stands on the text baseline like a glyph would. The card title
 * does exactly that.
 */
export interface ProjectMarkProps {
  className?: string;
  weight?: string;
}

/**
 * DogDays: a wall calendar with a bone pinned to it.
 *
 * Drawn against the font's metrics, so it sits in a line of Alan Sans as a
 * letter would. The calendar's body, from the top of the header band to the
 * bottom edge of the frame, is cap height; the two binder tabs rise above the
 * cap line the way an accent would. The header band is 1.75 strokes deep and
 * the frame walls one stroke. The band's bottom corners are flat so it reads
 * as a strip laid over the frame, not a rounded lid on it. The 43-unit box is
 * 37 units of body, so at 0.68em of cap height the box is 0.79em.
 */
export function DogDaysIcon({ className }: ProjectMarkProps) {
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

/**
 * DogPack: one bold paw, four pads gathered around a center.
 *
 * The box is the paw's own bounds, 37.86 by 31.18, so with its bottom on the
 * baseline and its height at cap height (0.68em) it stands as tall as the D
 * beside it.
 */
export function DogPackIcon({ className }: ProjectMarkProps) {
  return (
    <svg
      viewBox="5.07 9.42 37.86 31.18"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
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

/**
 * The marks by name, with the height each wants in a line of text: the box's
 * height as a fraction of the em, when the mark's body is set to cap height.
 * Tailwind arbitrary values, so the card can drop them straight into a class.
 */
export const PROJECT_ICONS: Record<
  ProjectIconName,
  { Icon: (props: ProjectMarkProps) => React.JSX.Element; height: string }
> = {
  dogdays: { Icon: DogDaysIcon, height: "h-[0.79em]" },
  dogpack: { Icon: DogPackIcon, height: "h-[0.68em]" },
};
