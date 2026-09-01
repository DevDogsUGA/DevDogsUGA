import { MAUVE, THEME } from "../brand.js";
import { CardShell, cardContext, type CardContext } from "./CardShell.js";

/**
 * The card an ordinary page unfurls as: what it is, and one line on why.
 *
 * Title in the display face at a size that survives a phone-sized preview,
 * description in the body face beneath it. Both are given as copy rather than
 * scraped from the page, because a heading written to sit under a nav bar and a
 * heading written to be read alone in a Discord channel are rarely the same
 * sentence.
 */
export interface PageCardProps {
  width: number;
  height: number;
  title: string;
  description?: string;
  eyebrow?: string;
  accent?: string;
  footer?: string;
}

/**
 * The display size for a title, by how long it is and how much room there is.
 *
 * The card clamps rather than shrinks its content, so a title that overruns is
 * cropped instead of resized — these steps are what keep it from getting
 * there. The square layout gets the largest type because it has the height to
 * spend; the wide one the smallest, because its content column is narrow.
 */
function titleSize(title: string, { layout }: CardContext): number {
  const base = layout === "square" ? 104 : layout === "wide" ? 78 : 92;
  if (title.length > 46) return base * 0.67;
  if (title.length > 28) return base * 0.83;

  return base;
}

export function PageCard({
  width,
  height,
  title,
  description,
  eyebrow,
  accent,
  footer,
}: PageCardProps) {
  const context = cardContext(width, height);

  return (
    <CardShell
      width={width}
      height={height}
      eyebrow={eyebrow}
      accent={accent}
      footer={footer}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24 * context.u,
          maxWidth: context.contentWidth,
        }}
      >
        <div
          style={{
            fontFamily: "Alan Sans",
            fontWeight: 800,
            fontSize: titleSize(title, context) * context.u,
            lineHeight: 1.05,
            color: THEME.heading,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              fontFamily: "Hanken Grotesk",
              fontSize: 32 * context.u,
              lineHeight: 1.4,
              color: MAUVE[300],
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}
