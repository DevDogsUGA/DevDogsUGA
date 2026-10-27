/**
 * The Changelog's design tokens, transcribed to email-safe literals.
 *
 * Everything here must survive the worst renderer the newsletter will meet —
 * classic Outlook's Word engine — so colors are flat hex (no alpha, no
 * oklch), fonts are longhand stacks, and the site's translucent chip classes
 * (`border-{c}-400/30 bg-{c}-500/10 text-{c}-300`) are precomputed with
 * `mix()` instead of asking a mail client to composite them.
 */
import type { CSSProperties } from "react";
import { EVENT_CATEGORY_VISUALS } from "@devdogsuga/sdk/brand/event";

/** The club accent — UGA arch black on red. */
export const UGA = "#ba0c2f";

/**
 * Event-category colors (the theme keeps its older `interest` and `demo` names for
 * `info` and `milestone`, which the hosted glow images are filed under), taken from the calendar's own vocabulary in
 * `@devdogsuga/sdk/brand/event` rather than restated: the chips here and the
 * chips on the site's schedule are the same promise about the same event
 * types.
 */
export const KIND = {
  interest: EVENT_CATEGORY_VISUALS.info.accent,
  build: EVENT_CATEGORY_VISUALS.build.accent,
  study: EVENT_CATEGORY_VISUALS.study.accent,
  social: EVENT_CATEGORY_VISUALS.social.accent,
  demo: EVENT_CATEGORY_VISUALS.milestone.accent,
  workshop: EVENT_CATEGORY_VISUALS.workshop.accent,
} as const;

/** The mauve surfaces, matching the platform (mauve-950 canvas → -300 text). */
export const PALETTE = {
  bg: "#13121b",
  bar: "#0e0d15",
  card: "#201e2b",
  card2: "#26232f",
  border: "#332f40",
  ink: "#f3f1f6",
  mute: "#a49eb1",
  dim: "#6f6a80",
} as const;

export const SITE = "https://devdogsuga.org";

export const SOCIAL_LINKS = [
  { label: "discord", icon: "discord", url: "https://discord.gg/devdogs" },
  {
    label: "instagram",
    icon: "instagram",
    url: "https://instagram.com/devdogsuga",
  },
  { label: "github", icon: "github", url: "https://github.com/devdogsuga" },
  {
    label: "web",
    icon: "globe",
    // The link-in-bio entry point: ?utm_content=linkinbio opens the site's
    // app switcher (see the platform's AppSwitcher/AutoOpen), landing the
    // reader on the same linktree experience as QR codes and social bios.
    url: `${SITE}/?utm_content=linkinbio`,
  },
] as const;

/**
 * The site's three typefaces on Google Fonts — the same trio `layout.tsx`
 * loads through next/font. Apple Mail, iOS Mail and most webview clients honor
 * the `<link>`/`@import`; Gmail and Outlook ignore them and fall down the
 * stacks in `EMAIL_FONTS`.
 */
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Alan+Sans:wght@400..900&family=Cascadia+Code:wght@400;600;700&family=Hanken+Grotesk:wght@400;600;700;800&display=swap";

export interface FontStacks {
  display: string;
  sans: string;
  mono: string;
}

/** Literal family stacks for the email body, web font first. */
export const EMAIL_FONTS: FontStacks = {
  display:
    "'Alan Sans', 'Hanken Grotesk', 'Avenir Next', 'Century Gothic', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  sans: "'Hanken Grotesk', 'Segoe UI', Roboto, 'Avenir Next', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
  mono: "'Cascadia Code', 'Cascadia Mono', 'SFMono-Regular', Consolas, Menlo, 'Courier New', monospace",
};

/**
 * The page-side stacks: next/font renames every family it self-hosts, so a
 * literal 'Alan Sans' would never match on the site. The CSS variables the
 * root layout sets are the only spelling both dev and prod agree on.
 */
export const CSS_VARIABLE_FONTS: FontStacks = {
  display: "var(--font-display, sans-serif)",
  sans: "var(--font-sans, sans-serif)",
  mono: "var(--font-mono, monospace)",
};

/**
 * A flat blend of `fg` into `bg` at opacity `t` — what the site's translucent
 * chip classes compute at composite time, precomputed here because alpha
 * channels do not survive every mail client.
 */
export function mix(fg: string, bg: string, t: number): string {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [channels(fg), channels(bg)];
  return `#${a
    .map((v, i) =>
      Math.round(v * t + (b[i] ?? 0) * (1 - t))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * The three flattened colors of one event chip, shared between the `Chip`
 * component and the dark-mode pinning stylesheet so the pinned values can
 * never drift from the rendered ones.
 */
export function chipColors(color: string, ground: string) {
  return {
    border: mix(color, ground, 0.35),
    fill: mix(color, ground, 0.12),
    text: mix(color, "#ffffff", 0.62),
  };
}

/** The two lightened accent tints the quiet bottom cards title with. */
export const HEADING_TINTS = {
  newHere: mix(KIND.study, "#ffffff", 0.62),
  signoff: mix(UGA, "#ffffff", 0.45),
} as const;

/**
 * Longhand font styling. The shorthand `font: 700 13px/1 …` reads better in a
 * template string but classic Outlook applies it unreliably, so every text
 * style is spelled out property by property.
 */
export function font(
  weight: number,
  size: number,
  lineHeight: number | string,
  family: string,
): CSSProperties {
  return {
    fontWeight: weight,
    fontSize: `${size}px`,
    lineHeight,
    fontFamily: family,
  };
}

/**
 * A solid background painted twice: as `background-color` for the clients
 * that only read that, and again as a same-color `linear-gradient` image
 * layer, as Gmail dark-mode armor (Gmail rewrites background colors but
 * leaves background images alone). Classic Outlook ignores background images
 * and falls back to the flat color.
 *
 * These background styles ride in `paintCss()` rules, NEVER inline: the web
 * Outlooks' dark mode rewrites every inline background in place with inline
 * `!important` (which no stylesheet rule can outrank) and strips inline
 * background images, but leaves the embedded stylesheet's colors untouched —
 * proven on a received copy, 2026-09-11. The one deliberate exception is
 * `<body>` in `ChangelogDocument`, whose inline background exists to be
 * repainted (see the comment there).
 */
export function solidBg(color: string): CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: `linear-gradient(${color},${color})`,
  };
}

/** The site's `.slants` stripe: white 45° slants over a color. The solid `backgroundColor` comes first so clients that drop gradients degrade flat; the closing `linear-gradient` layer is the same Gmail armor as `solidBg` — and like `solidBg`, this ships only through `paintCss()`. */
export function slants(color: string): CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: `repeating-linear-gradient(45deg,rgba(255,255,255,.24) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.24) 50%,rgba(255,255,255,.24) 75%,transparent 75%),linear-gradient(${color},${color})`,
    backgroundSize: "16px 16px,auto",
  };
}

/** `bg-dot-grid` — a radial dot texture degrading to the flat color underneath, with the same-color gradient underlay as Gmail armor (see `solidBg`; stylesheet-only, like every background). */
export function dotGrid(bg: string, dot: string): CSSProperties {
  return {
    backgroundColor: bg,
    backgroundImage: `radial-gradient(${dot} 1px,transparent 1px),linear-gradient(${bg},${bg})`,
    backgroundSize: "15px 15px,auto",
  };
}

/** A colored block shadow edged in black — the site's `shadow-block-outlined-*`. */
export function blockShadow(color: string, size = 6): CSSProperties {
  return {
    boxShadow: `${size + 1}px ${size + 1}px 0 0 #000, ${size}px ${size}px 0 0 ${color}`,
  };
}

/** GDGC prioritizes Google's familiar UI face, then available system fonts. */
export const GDGC_FONT_STACK =
  "'Google Sans', Roboto, 'Segoe UI', 'Avenir Next', Helvetica, Arial, sans-serif";

/** The GDGC email's light palette: Google's pastel surfaces, ink and link blue. */
export const GDGC = {
  ink: "#1e1e1e",
  blue: "#185abc",
  white: "#ffffff",
  grey: "#f0f0f0",
  sky: "#c3ecf6",
  mint: "#ccf6c5",
  butter: "#ffe7a5",
  blush: "#f8d8d8",
} as const;

/**
 * The GDGC email's dark version, per property, keyed by the light color an
 * element's class names. Surfaces stay dark enough for the light text the
 * web Outlooks force onto everything they repaint, so the button keeps a
 * saturated blue under its white label rather than Google's pale dark-mode
 * blue.
 */
export const GDGC_DARK = {
  color: {
    [GDGC.ink]: "#e8eaed",
    [GDGC.blue]: "#8ab4f8",
    [GDGC.white]: "#ffffff",
  },
  background: {
    [GDGC.grey]: "#202124",
    [GDGC.sky]: "#12333d",
    [GDGC.mint]: "#173a1c",
    [GDGC.butter]: "#3a3014",
    [GDGC.blush]: "#42211f",
    [GDGC.blue]: "#1a73e8",
  },
  border: {
    [GDGC.ink]: "#bdc1c6",
  },
} as const satisfies Record<string, Record<string, string>>;
