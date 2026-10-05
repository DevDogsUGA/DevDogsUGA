/**
 * The masthead face: 4×5-pixel capitals, folded two pixel rows per text row
 * with half blocks (▀ ▄ █) so a word stands three lines tall. Only the
 * characters the banners actually spell are drawn; `banner` throws on the
 * rest, so a new banner word that needs a glyph fails in the unit tests
 * rather than printing a gap.
 */
const GLYPHS: Record<string, readonly string[]> = {
  A: [" ## ", "#  #", "####", "#  #", "#  #"],
  B: ["### ", "#  #", "### ", "#  #", "### "],
  C: [" ###", "#   ", "#   ", "#   ", " ###"],
  D: ["### ", "#  #", "#  #", "#  #", "### "],
  E: ["####", "#   ", "### ", "#   ", "####"],
  F: ["####", "#   ", "### ", "#   ", "#   "],
  G: [" ###", "#   ", "# ##", "#  #", " ###"],
  H: ["#  #", "#  #", "####", "#  #", "#  #"],
  I: ["####", " ## ", " ## ", " ## ", "####"],
  J: ["  ##", "   #", "   #", "#  #", " ## "],
  K: ["#  #", "# # ", "##  ", "# # ", "#  #"],
  L: ["#   ", "#   ", "#   ", "#   ", "####"],
  M: ["#  #", "####", "####", "#  #", "#  #"],
  N: ["#  #", "## #", "# ##", "#  #", "#  #"],
  O: [" ## ", "#  #", "#  #", "#  #", " ## "],
  P: ["### ", "#  #", "### ", "#   ", "#   "],
  Q: [" ## ", "#  #", "#  #", "# ##", " ###"],
  R: ["### ", "#  #", "### ", "# # ", "#  #"],
  S: [" ###", "#   ", " ## ", "   #", "### "],
  T: ["####", " ## ", " ## ", " ## ", " ## "],
  U: ["#  #", "#  #", "#  #", "#  #", " ## "],
  V: ["#  #", "#  #", "#  #", " ## ", " ## "],
  W: ["#  #", "#  #", "####", "####", "#  #"],
  X: ["#  #", " ## ", " ## ", " ## ", "#  #"],
  Y: ["#  #", "#  #", " ## ", " ## ", " ## "],
  Z: ["####", "  # ", " #  ", "#   ", "####"],
  "0": [" ## ", "# ##", "####", "## #", " ## "],
  "1": [" ## ", "### ", " ## ", " ## ", "####"],
  "2": ["### ", "   #", " ## ", "#   ", "####"],
  "3": ["### ", "   #", " ## ", "   #", "### "],
  "4": ["#  #", "#  #", "####", "   #", "   #"],
  "5": ["####", "#   ", "### ", "   #", "### "],
  "6": [" ## ", "#   ", "### ", "#  #", " ## "],
  "7": ["####", "   #", "  # ", " #  ", " #  "],
  "8": [" ## ", "#  #", " ## ", "#  #", " ## "],
  "9": [" ## ", "#  #", " ###", "   #", " ## "],
  " ": ["  ", "  ", "  ", "  ", "  "],
  _: ["    ", "    ", "    ", "    ", "####"],
};

export interface BannerGlyph {
  /** The three folded rows of one character, including its trailing gap. */
  rows: [string, string, string];
  char: string;
}

function fold(top: string, bottom: string): string {
  let out = "";
  for (let i = 0; i < top.length; i++) {
    const t = top[i] !== " ";
    const b = bottom[i] !== " ";
    out += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
  }
  return out;
}

/** One folded glyph per character, each followed by a one-column gap. */
export function banner(word: string): BannerGlyph[] {
  return [...word].map((char) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`No banner glyph for ${JSON.stringify(char)}.`);
    const px = [...glyph, " ".repeat(glyph[0]!.length)].map((row) => `${row} `);
    return {
      char,
      rows: [fold(px[0]!, px[1]!), fold(px[2]!, px[3]!), fold(px[4]!, px[5]!)],
    };
  });
}

/** How many columns `banner(word)` occupies. */
export function bannerWidth(word: string): number {
  return banner(word).reduce((sum, glyph) => sum + glyph.rows[0].length, 0);
}
