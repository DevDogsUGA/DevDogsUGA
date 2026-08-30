import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import MarqueeItem, { type MarqueeIcon } from "./MarqueeItem";
import MarqueeTrack from "./MarqueeTrack";

export { MarqueeItem };
export type { MarqueeIcon };

interface SectionMarqueeProps {
  slope: "bs" | "fs";
  bg?: string;
  className?: string;
  duration?: number;
  copyZBase?: number;
  /**
   * Opts into the hover-invert interaction defined in globals.css: hovering one
   * item dims every other item, in every looped copy. For marquees whose items
   * are links, such as the homepage's section-highlight cards, not the plain
   * scrolling text strips.
   */
  hoverInvert?: boolean;
  /** See {@link MarqueeTrack}'s prop of the same name. */
  keepHoveredInView?: boolean;
  /**
   * The divider glyph this strip puts between its items, injected into every
   * {@link MarqueeItem} below. Optional because a strip of cards has no
   * dividers to draw.
   */
  icon?: MarqueeIcon;
  children: ReactNode[];
  "aria-label"?: string;
}

export default function SectionMarquee({
  slope,
  bg = "",
  className,
  duration = 100,
  copyZBase,
  hoverInvert,
  keepHoveredInView,
  icon,
  children,
  "aria-label": ariaLabel,
}: SectionMarqueeProps) {
  const direction = slope === "bs" ? "right" : "left";
  const skewCls = slope === "bs" ? "skew-section" : "skew-section-neg";

  // The divider is the strip's, not the item's, so it is handed down here
  // rather than repeated at every call site.
  const itemsWithIcon = Children.map(children, (child) =>
    isValidElement(child) && child.type === MarqueeItem
      ? cloneElement(child as ReactElement<{ icon?: MarqueeIcon }>, { icon })
      : child,
  );

  return (
    <div
      className={`w-full overflow-x-clip overflow-y-visible ${bg} relative z-10 ${skewCls}`}
      aria-label={ariaLabel}
      data-hover-invert={hoverInvert ?? undefined}
    >
      <MarqueeTrack
        duration={duration}
        direction={direction}
        copyZBase={copyZBase}
        keepHoveredInView={keepHoveredInView}
        className={className}
      >
        {itemsWithIcon}
      </MarqueeTrack>
    </div>
  );
}
