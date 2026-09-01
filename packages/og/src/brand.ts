import { oklch } from "./oklch.js";

/**
 * The palette these images are drawn from, in the notation the app declares it
 * in.
 *
 * Every value below is transcribed from `tailwindcss/theme.css` (4.3.3) — the
 * same file `apps/platform/src/styles/globals.css` reads `--color-mauve-*` out
 * of — and converted to hex on the way past, because Satori cannot read
 * `oklch()`. Transcribed rather than imported: Tailwind ships the ramp as CSS,
 * not as a module, and parsing a stylesheet out of `node_modules` at render
 * time would make every OG response depend on the shape of a file Tailwind is
 * free to reformat. `palette.test.ts` reads that stylesheet and asserts these
 * match, which catches the drift without paying for it at runtime.
 */
export const MAUVE = {
  50: oklch(0.985, 0, 0),
  100: oklch(0.96, 0.003, 325.6),
  200: oklch(0.922, 0.005, 325.62),
  300: oklch(0.865, 0.012, 325.68),
  400: oklch(0.711, 0.019, 323.02),
  500: oklch(0.542, 0.034, 322.5),
  600: oklch(0.435, 0.029, 321.78),
  700: oklch(0.364, 0.029, 323.89),
  800: oklch(0.263, 0.024, 320.12),
  900: oklch(0.212, 0.019, 322.12),
  950: oklch(0.145, 0.008, 326),
} as const;

/** The accents the projects and their marks are drawn in. Same source. */
export const ACCENT = {
  red400: oklch(0.704, 0.191, 22.216),
  red700: oklch(0.505, 0.213, 27.518),
  purple400: oklch(0.714, 0.203, 305.504),
  purple700: oklch(0.496, 0.265, 301.924),
  cyan400: oklch(0.789, 0.154, 211.53),
  amber400: oklch(0.828, 0.189, 84.429),
  emerald400: oklch(0.765, 0.177, 163.223),
} as const;

export const WHITE = "#ffffff";

/**
 * The roles those colours play, named for the job rather than the swatch.
 *
 * `.dark` in globals.css is the mapping this mirrors: background is mauve-950,
 * cards mauve-900, borders mauve-800, muted text mauve-400. The templates read
 * these and never the ramp, so a theme change is one edit here.
 *
 * `INK` is not `MAUVE[950]`. Borders and block shadows on this site are drawn
 * in true black, and against a mauve-950 ground the two are close enough that a
 * mauve border would read as no border at all.
 */
export const THEME = {
  background: MAUVE[950],
  card: MAUVE[900],
  border: MAUVE[800],
  heading: WHITE,
  body: MAUVE[300],
  muted: MAUVE[400],
  /** Borders and block shadows, on light grounds and dark alike. */
  ink: "#000000",
} as const;

/** How far a block shadow is thrown, matching `--block-shadow-*`. */
export const BLOCK_SHADOW = { sm: 2, md: 4, lg: 5, xl: 8 } as const;

/**
 * Where the club is, in the order these lines are read.
 *
 * One handle serves all three networks, which is why the socials row sets the
 * marks together and the handle once rather than repeating `@devdogsuga`
 * three times. Kept in step with `apps/platform/src/config/nav.ts`.
 */
export const CONTACT = {
  site: "devdogsuga.org",
  handle: "@devdogsuga",
  email: "devdogs@uga.edu",
} as const;

/**
 * The wordmark's cap height and baseline, as fractions of the wordmark asset's height.
 *
 * "DevDogs" has a descender, so its ink box is taller than the letters read.
 * Two lockups set to the same ink height do not look the same size; two set to
 * the same cap height do. Templates that pair the wordmark with other type size
 * it by cap height and use these to convert.
 */
export const WORDMARK_METRICS = {
  capHeightRatio: 12.275 / 16.1,
  baselineRatio: (21.15 - 8.875) / 16.1,
} as const;
