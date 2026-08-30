import "~/styles/globals.css";

import { Suspense } from "react";
import { type Metadata } from "next";
import { Alan_Sans, Cascadia_Code, Hanken_Grotesk } from "next/font/google";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import NavigationProgress from "~/ui/navigation-progress";
import QueryProvider from "~/ui/query-provider";
import Toaster from "~/components/Toaster";
import { cn } from "~/lib/cn";
import { env } from "~/env";
import { ANNOUNCEMENT_HIDE_SCRIPT } from "~/config/announcement";

export const metadata: Metadata = {
  title: "DevDogs",
  description:
    "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
  applicationName: "DevDogs",
  // Every relative URL in a `metadata` export resolves against this, Open
  // Graph and Twitter card images above all. Without it Next resolves them
  // against a localhost guess, so a link shared off the machine that built it
  // previews with no image, silently. BASE_URL is the same value the OAuth
  // callbacks are built from (server/auth/providers/*), which keeps the
  // preview origin and the redirect origin from drifting apart. Its schema
  // defaults to http://localhost:3000 in development and is required in every
  // deployed environment, so there is no second fallback to write here.
  metadataBase: new URL(env.BASE_URL),
};

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" });

/**
 * Alan Sans and Cascadia Code are both newer than the font-metrics table Next
 * ships (`next/dist/server/capsize-font-metrics.json`), which is the only
 * place `next/font/google` looks for the `size-adjust` and `ascent-override`
 * values it builds a fallback face out of. Neither is in it, so Next generated
 * no fallback face for either one and said so on every build:
 *
 *     Failed to find font override values for font `Alan Sans`
 *     Skipping generating a fallback font.
 *
 * That was not cosmetic. With no fallback face, next/font emitted a bare
 * `--font-display: "Alan Sans"`, and that declaration beats the @theme one in
 * globals.css (equal specificity, later stylesheet), so the generic
 * `sans-serif` written there never applied to anything. Until Alan Sans
 * finished loading, every display heading rendered in the browser's default
 * face, Times New Roman in Chrome, a serif at serif metrics. The page reflowed
 * when the real font swapped in: one layout shift at ~110ms, CLS 0.404,
 * deterministic at every throttling tier. Hanken Grotesk IS in the table,
 * which is why only these two fonts say anything below.
 *
 * Two settings do the silencing, one per bundler: an explicit `fallback` list
 * short-circuits Turbopack's metrics lookup before it can fail, while the
 * Webpack loader decides on `adjustFontFallback` instead. Both are set so the
 * warning cannot come back through whichever path a build takes.
 */

/**
 * The metric-matched stand-in `next/font/google` would have written itself, in
 * the same shape as the `Hanken Grotesk Fallback` face it does emit. Worked out
 * here the way `next/font/local` does it, with fontkit over the emitted Alan
 * Sans woff2: ascent 990, descent -310, lineGap 0, unitsPerEm 1000, average
 * advance width measured against Arial's.
 *
 * `size-adjust` and the three overrides are a matched pair on purpose: each
 * override is a fraction of the *adjusted* em, so the two cancel and the line
 * box lands on Alan Sans' real 1.30em however the glyph widths fall out. That
 * height is the half that was moving the page. The widths are measured at the
 * variable font's default instance (300) while most headings are 700-800 and
 * run a few percent wider, the same approximation Next's own table makes. It
 * costs line wrapping, not line height.
 *
 * `src` lists Arial's metric clones as well as Arial: the overrides define the
 * line box whichever one resolves, so every extra name is another machine that
 * gets the adjusted metrics instead of falling through to the generics.
 */
const DISPLAY_FALLBACK_FAMILY = "Alan Sans Fallback";

const displayFallbackFace = `@font-face {
  font-family: "${DISPLAY_FALLBACK_FAMILY}";
  src: local("Arial"), local("Helvetica"), local("Liberation Sans"), local("Roboto");
  ascent-override: 97.06%;
  descent-override: 30.39%;
  line-gap-override: 0.00%;
  size-adjust: 102.00%;
}`;

const display = Alan_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  // Written out rather than referencing DISPLAY_FALLBACK_FAMILY: the font
  // loader is a compile-time transform and rejects anything it cannot read as
  // a literal ("Font loader values must be explicitly written literals"), so
  // the name is spelled twice on purpose. Keep the two in step.
  fallback: ["Alan Sans Fallback", "ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: false,
});

// Cascadia Code hit the same missing-metrics warning and had the same bare
// `--font-mono: "Cascadia Code"`. It gets the fallback list but deliberately
// no override face: at 1900/2048 ascent and 480/2048 descent it already sits
// within about a percent of Menlo, Consolas and Liberation Mono. The face Next
// would have reached for is a size-adjusted local(Arial), because its table
// only tells serif from everything else, which swaps a proportional font in
// for a monospace one and shifts more than the adjustment saves.
const mono = Cascadia_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  fallback: [
    "ui-monospace",
    "Menlo",
    "Consolas",
    "Liberation Mono",
    "monospace",
  ],
  adjustFontFallback: false,
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        display.variable,
        mono.variable,
        "font-sans",
        sans.variable,
        // In-page anchors (the homepage section marquee, the hero's "#events")
        // glide instead of teleporting. Only the document scroller is affected:
        // scroll-behavior is not inherited, so nested scrollers such as the
        // PronounsField listbox keep their instant scrollIntoView.
        "scroll-smooth motion-reduce:scroll-auto",
      )}
      // How Next is told the page opted into smooth scrolling. A same-page hash
      // change keeps it; a route transition temporarily forces
      // `scroll-behavior: auto`, so arriving on a new page, say through the
      // footer's "/#projects", snaps rather than animating the whole way down.
      // Without the attribute Next skips that override and dev-warns.
      // https://nextjs.org/docs/messages/missing-data-scroll-behavior
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="bg-black text-mauve-950">
        {/* Stamps `<html data-announcement="dismissed">` before first paint
            when this session already dismissed the current notice, so the card
            in the static shell never flashes up. First in the <body> so it has
            run long before the markup it hides is parsed.

            It lives here, not in AnnouncementBanner, because a <script>
            returned from a client component is only ever real in the server
            HTML. On a client render React substitutes a <div> and warns. The
            banner returns null on the console routes, so navigating back to a
            public page re-created it client-side every time. See
            ~/config/announcement. */}
        {ANNOUNCEMENT_HIDE_SCRIPT && (
          <script
            dangerouslySetInnerHTML={{ __html: ANNOUNCEMENT_HIDE_SCRIPT }}
          />
        )}
        {/* React hoists a <style> carrying both `href` and `precedence` into
            <head> and dedupes it there, which is how a layout that owns no
            stylesheet of its own gets the @font-face above into the document.
            It has to travel in the initial HTML rather than a later chunk: a
            metric override that arrives after first paint has already missed
            the shift it exists to prevent. */}
        <style
          href="alan-sans-fallback"
          precedence="default"
          dangerouslySetInnerHTML={{ __html: displayFallbackFace }}
        />
        {/* NavigationProgress reads usePathname(), which is dynamic under
            Cache Components and must sit inside a <Suspense> boundary. It
            renders null, so the prerendered shell shows nothing for it until
            it hydrates.

            AnimationInit deliberately does NOT live here. It mutates the
            `class` attribute of [data-animate] elements, which React owns, so
            it has to run after the page body has hydrated. See
            (site)/layout.tsx. */}
        <Suspense>
          <NavigationProgress />
        </Suspense>
        <TooltipProvider>
          <QueryProvider>
            <Toaster />
            {children}
          </QueryProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
