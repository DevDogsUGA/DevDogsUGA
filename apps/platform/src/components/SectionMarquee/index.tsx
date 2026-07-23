import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import MarqueeItem from "./MarqueeItem";
import ScrollMarquee from "./ScrollMarquee";

export { MarqueeItem };

interface SectionMarqueeProps {
  slope: "bs" | "fs";
  bg?: string;
  className?: string;
  duration?: number;
  copyZBase?: number;
  children: ReactNode[];
  "aria-label"?: string;
}

export default function SectionMarquee({
  slope,
  bg = "",
  className,
  duration = 100,
  copyZBase,
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
      className={`w-full overflow-hidden ${bg} relative z-10 ${skewCls}`}
      aria-label={ariaLabel}
    >
      <ScrollMarquee
        baseDuration={duration}
        direction={direction}
        copyZBase={copyZBase}
        className={className}
      >
        {indexedChildren}
      </ScrollMarquee>
    </div>
  );
}
