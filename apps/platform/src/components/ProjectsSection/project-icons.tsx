import { DOGDAYS_MARK, DOGPACK_MARK, markBody } from "@devdogsuga/brand/marks";
import type { ProjectIconName } from "~/config/projects";

/**
 * The DevDogs apps' marks, drawn by `@devdogsuga/brand/marks` (the one copy of
 * their geometry; the OG cards and icons draw the same data), matched to Alan Sans at the bold
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
      viewBox={DOGPACK_MARK.viewBox}
      width="1em"
      height="1em"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: markBody("dogpack") }}
    />
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
