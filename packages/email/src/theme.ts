/**
 * Email design tokens.
 *
 * Plain values rather than CSS custom properties: variable support is patchy
 * across clients and absent in Outlook, and a token that resolves to nothing
 * produces an unstyled email rather than a fallback.
 *
 * **One palette, not two.** Client support for `prefers-color-scheme` is
 * partial and Outlook inverts colors on its own regardless, so a dark variant
 * would be honoured by only some clients while the rest invert the light one
 * into something nobody designed. These colors read correctly under both.
 */
export const theme = {
  color: {
    ink: "#1a1a1a",
    muted: "#5c5c5c",
    line: "#e4e4e4",
    surface: "#ffffff",
    canvas: "#f4f4f5",
    /** UGA arch black on red. The club's marks, not the university's. */
    accent: "#ba0c2f",
    accentInk: "#ffffff",
  },
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  size: {
    body: "16px",
    small: "14px",
    heading: "22px",
  },
  space: {
    gutter: "24px",
    block: "16px",
  },
  radius: "8px",
  maxWidth: "560px",
} as const;
