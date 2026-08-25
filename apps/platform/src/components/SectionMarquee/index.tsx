import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import MarqueeItem from "./MarqueeItem";
import MarqueeTrack from "./MarqueeTrack";

export { MarqueeItem };

interface SectionMarqueeProps {
  slope: "bs" | "fs";
  bg?: string;
  className?: string;
  duration?: number;
  copyZBase?: number;
  /**
   * Opts this marquee into the hover-invert interaction defined in
   * globals.css: hovering one item dims every other item, in every looped
   * copy. Meant for marquees whose items are individually meaningful links
   * (e.g. the homepage's section-highlight cards), not the plain scrolling
   * text strips.
   */
  hoverInvert?: boolean;
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
  children,
  "aria-label": ariaLabel,
}: SectionMarqueeProps) {
  const direction = slope === "bs" ? "right" : "left";
  const skewCls = slope === "bs" ? "skew-section" : "skew-section-neg";

  let itemIndex = 0;
  const indexedChildren = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === MarqueeItem) {
      return cloneElement(child as ReactElement<{ index: number }>, {
        index: itemIndex++,
      });
    }
    return child;
  });

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
        className={className}
      >
        {indexedChildren}
      </MarqueeTrack>
    </div>
  );
}
