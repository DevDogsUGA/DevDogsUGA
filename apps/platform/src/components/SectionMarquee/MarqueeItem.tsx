import type { ComponentType, ReactNode } from "react";

/**
 * The glyph a strip puts between its items. Structural, not decorative: it is
 * the only thing separating one phrase from the next in a line that never
 * stops, so it has to read as punctuation.
 */
export type MarqueeIcon = ComponentType<{
  size?: number;
  weight?: "fill";
}>;

/**
 * One phrase in a scrolling text strip, followed by the strip's divider.
 *
 * The divider used to cycle through seven icons by item index, which made the
 * separator itself something to read: a rocket, then a flame, then a git
 * branch, all at the same weight as the words around them. One glyph per strip
 * says "and then" and gets out of the way, and it is the strip's own mark, so
 * it can carry the section's subject the way the colour does.
 */
export default function MarqueeItem({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  /** Injected by `SectionMarquee` from its own `icon`; never passed by hand. */
  icon?: MarqueeIcon;
}) {
  return (
    <span className="flex items-center gap-6 px-4">
      <span>{children}</span>
      {Icon ? (
        <span className="drop-shadow-block-sm opacity-60">
          {/* Filled rather than outlined: at 18px against uppercase display
              text, an outline reads as a smudge and a solid shape reads as a
              mark. */}
          <Icon size={18} weight="fill" />
        </span>
      ) : null}
    </span>
  );
}
