import type { ProjectIconName } from "~/config/projects";

/**
 * Hand-drawn marks for the DevDogs apps, matched to Alan Sans at the bold
 * weight the cards set their titles in: strokes ~0.15em thick (the font's
 * 700-weight stems measure 0.163em, its bars 0.14em), round-capped terminals
 * like the font's arm endings, and square-shouldered outer corners like its
 * stem strips. Both render in currentColor so each card's titleColor tints
 * its own mark.
 */

/** DogDays — a calendar carrying a sun: the dog days of the semester. */
export function DogDaysIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="6"
        y="12.5"
        width="36"
        height="29"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="7"
      />
      {/* Binder tabs: round-capped capsules, like Alan Sans arm terminals. */}
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round">
        <line x1="15.5" y1="6.5" x2="15.5" y2="12" />
        <line x1="32.5" y1="6.5" x2="32.5" y2="12" />
      </g>
      <circle cx="24" cy="27" r="5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="32" y1="27" x2="34.5" y2="27" />
        <line x1="29.66" y1="32.66" x2="31.42" y2="34.42" />
        <line x1="24" y1="35" x2="24" y2="37.5" />
        <line x1="18.34" y1="32.66" x2="16.58" y2="34.42" />
        <line x1="16" y1="27" x2="13.5" y2="27" />
        <line x1="18.34" y1="21.34" x2="16.58" y2="19.58" />
        <line x1="24" y1="19" x2="24" y2="16.5" />
        <line x1="29.66" y1="21.34" x2="31.42" y2="19.58" />
      </g>
    </svg>
  );
}

/** DogPack — one bold paw: four pads gathered around a center, a pack. */
export function DogPackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 24 24.6 C 28.6 24.6 34.7 26.8 35.5 31.6 C 36.2 36.4 30.8 40.6 24 40.6 C 17.2 40.6 11.8 36.4 12.5 31.6 C 13.3 26.8 19.4 24.6 24 24.6 Z" />
      <ellipse
        cx="16.8"
        cy="15.5"
        rx="4.4"
        ry="5.6"
        transform="rotate(-8 16.8 15.5)"
      />
      <ellipse
        cx="31.2"
        cy="15.5"
        rx="4.4"
        ry="5.6"
        transform="rotate(8 31.2 15.5)"
      />
      <ellipse
        cx="9.4"
        cy="24.4"
        rx="4.2"
        ry="5.4"
        transform="rotate(-30 9.4 24.4)"
      />
      <ellipse
        cx="38.6"
        cy="24.4"
        rx="4.2"
        ry="5.4"
        transform="rotate(30 38.6 24.4)"
      />
    </svg>
  );
}

export const PROJECT_ICONS: Record<
  ProjectIconName,
  (props: { className?: string }) => React.JSX.Element
> = {
  dogdays: DogDaysIcon,
  dogpack: DogPackIcon,
};
