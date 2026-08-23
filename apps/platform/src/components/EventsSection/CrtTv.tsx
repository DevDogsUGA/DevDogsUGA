"use client";

import { useId } from "react";
import type { StaticImageData } from "next/image";

/**
 * A CRT television, drawn rather than photographed, with a live screen.
 *
 * ## Why it is a drawing and not an image
 *
 * A photo or a stock render would be the only piece of the site not built out
 * of the same parts as everything else. Vector also means the screen aperture
 * is a *known shape* at every size, which is the thing that actually makes this
 * work — see below.
 *
 * ## Why the GIF is an SVG `<image>` and not `next/image`
 *
 * The screen is not a rectangle. A real tube bulges, so the aperture here is
 * four quadratic curves, and the picture has to be clipped to exactly that
 * shape at every viewport width. Two ways to do that with an HTML element on
 * top — `foreignObject` inside the SVG, or a CSS `clip-path: path()` on a
 * positioned div — and both fail in a way that matters: `clip-path: path()`
 * takes fixed user units and cannot scale with a fluid container, and
 * `foreignObject` under a `clipPath` has a long history of rendering
 * incorrectly in WebKit. An SVG `<image>` inside a `<clipPath>` group is the
 * boring option that is correct at every size in every engine.
 *
 * Nothing is lost by giving up `next/image` here. These are animated GIFs, and
 * the optimiser passes animated files through untouched — so the bytes on the
 * wire are identical either way. The static import is kept for its `.src`,
 * which is still the hashed, immutably-cacheable URL the build emits.
 *
 * ## How the volume is built
 *
 * Two pieces, not three faces. The whole silhouette is drawn once as a rounded
 * shell and the front face is laid on top of it, so the top and the right side
 * are simply the parts of the shell the front does not cover. One gradient
 * therefore lights both of them, running down-right along the axis
 * perpendicular to the crease — which puts the top face in the light half and
 * the side face in the dark half without either being painted separately. It
 * is also what makes the rounding tractable: one path to round rather than
 * three that have to agree at every seam.
 *
 * Value is what carries the form, so the three surfaces are separated by
 * lightness first and hue second: top light, front middle, side dark. Cyan
 * appears only on the fittings, where it is the mascot's teal against the
 * mascot's red rather than a second thing competing to be the body colour.
 *
 * ## The no-signal state is the design
 *
 * `noSignal` plays underneath the whole time and shows through whenever
 * nothing is selected. That was already true of the panel this replaces — it
 * was static.gif under a stack — but on a rectangle it read as a placeholder,
 * and on a tube it reads as a television that is on and tuned to nothing,
 * which is what it always was.
 */

interface Props {
  /** Plays underneath, always. Shows through when `showing` is null. */
  noSignal: StaticImageData;
  /**
   * What is on screen, or null.
   *
   * `key` remounts the `<image>` rather than re-pointing one, because a GIF
   * whose href changes keeps playing from wherever the previous one left off
   * instead of restarting — the same reason the panel this replaces keyed its
   * `<Image>` on the beat title.
   */
  showing: { key: string; image: StaticImageData } | null;
  className?: string;
}

/*
 * Geometry, in viewBox units.
 *
 * Front face:  x 18…300, y 84…300, corner radius 16
 * Depth:       +56 x, −34 y  (back and up, so the set is seen from below-left)
 *
 * The silhouette is the convex hull of the front face and that same rectangle
 * pushed along the depth vector. Its corners are rounded by walking 16 units
 * back down each incoming edge, curving through the vertex, and landing 16
 * units along the outgoing one — the radius is uniform even though the angles
 * are not, which is what stops the two oblique corners at the back from
 * looking sharper than the four square ones.
 */
const CORNER = 16;
const SHELL = [
  "M 18,100",
  "Q 18,84 31.7,75.7",
  "L 60.3,58.3",
  "Q 74,50 90,50",
  "L 340,50",
  "Q 356,50 356,66",
  "L 356,250",
  "Q 356,266 342.3,274.3",
  "L 313.7,291.7",
  "Q 300,300 284,300",
  "L 34,300",
  "Q 18,300 18,284",
  "Z",
].join(" ");

/**
 * The top face, laid over the shell so that what is left of the shell is the
 * right side and nothing else.
 *
 * Its own right edge IS the crease between top and side, which is why there is
 * no separate crease element: an edge drawn twice is an edge that can disagree
 * with itself. It closes below the front face's top edge rather than along it,
 * because the front is drawn afterwards and covers the overshoot — and at the
 * two top corners, where the front face rounds away, the overshoot is exactly
 * what should be visible. That is the top of the cabinet curving over.
 */
const TOP = [
  "M 18,100",
  "Q 18,84 31.7,75.7",
  "L 60.3,58.3",
  "Q 74,50 90,50",
  "L 340,50",
  "Q 356,50 350,62",
  "L 300,90",
  "Z",
].join(" ");

/**
 * The aperture: four quadratic curves, one per edge, each bowing outward.
 *
 * The corners are deliberately left as corners. A tube is not a rounded
 * rectangle — it is a rectangle pushed out from behind — and rounding the
 * joins here turns it into a bar of soap. This is the one part of the drawing
 * that does *not* get rounded off with the rest.
 */
const SCREEN =
  "M 52,110 Q 130,96 208,110 Q 234,177 208,245 Q 130,259 52,245 Q 26,177 52,110 Z";

/** The same shape, ~10 units bigger: the moulded rim the glass sits in. */
const BEZEL =
  "M 42,100 Q 130,86 218,100 Q 244,177 218,255 Q 130,269 42,255 Q 16,177 42,100 Z";

/**
 * The picture's own box, bled a few units past the aperture on every side so
 * `slice` has something to crop into the bulge. It is not the aperture: an
 * image fitted to the exact bounding box leaves the curved corners empty.
 */
const PICTURE = { x: 36, y: 98, width: 188, height: 158 } as const;

/*
 * The club's colours, used as light rather than as decoration.
 *
 * Rose is the body and cyan is the fittings, which is the mascot: red glasses
 * and a red laptop against teal. Amber is the third of the three the homepage's
 * stat cards already use, and it is here exactly once, on the power lamp, where
 * a colour nothing else on the set is wearing is the whole point.
 *
 * Each ramp is a single hue darkening, never a hue shift, because lightness is
 * what the eye reads as form. A gradient that changed hue across a face would
 * look like two materials meeting rather than one surface turning away.
 */
const ROSE = {
  50: "#fff1f2",
  100: "#ffe4e6",
  200: "#fecdd3",
  300: "#fda4af",
  500: "#f43f5e",
  600: "#e11d48",
  700: "#be123c",
  900: "#881337",
} as const;
const CYAN = { 100: "#cffafe", 200: "#a5f3fc", 400: "#22d3ee", 700: "#0e7490" };
const LAMP = "#fbbf24"; // amber-400

export default function CrtTv({ noSignal, showing, className }: Props) {
  // Strip everything that is not alphanumeric rather than just the colons the
  // rest of the codebase strips: React 19 hands back `«r0»`, not `:r0:`, so a
  // colon-only replace is now a no-op and these ids end up inside `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `crt-${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 400 380"
      // meet, not slice: the column this sits in is as tall as the list of
      // beats beside it, which is much taller than a television. Fitting would
      // stretch the chassis; this keeps it in proportion and lets the caller
      // decide where the spare height goes.
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={`drop-shadow-block-md h-auto w-full ${className ?? ""}`}
    >
      <defs>
        <clipPath id={id("screen")}>
          <path d={SCREEN} />
        </clipPath>

        {/* Every gradient here is userSpaceOnUse and aimed along the light,
            not along its own element's box. objectBoundingBox would restart
            each ramp inside whatever it fills, so two neighbouring parts of
            one cabinet would each run light-to-dark independently and the set
            would read as a collage of separately lit pieces. */}

        {/* The shell is only ever seen as the right side, since the top face
            and then the front are laid over the rest of it — so this is the
            side's ramp, and it is the darkest thing on the cabinet. The three
            surfaces are pulled apart by VALUE first: a viewer reads a form
            from light and dark long before they read it from an outline, and
            three faces at one lightness would be a flat pink shape with some
            lines on it however carefully the lines were drawn. */}
        <linearGradient
          id={id("shell")}
          gradientUnits="userSpaceOnUse"
          x1="300"
          y1="70"
          x2="360"
          y2="300"
        >
          <stop offset="0" stopColor={ROSE[600]} />
          <stop offset="1" stopColor={ROSE[900]} />
        </linearGradient>

        {/* The top, lightest, brightest at the front-left corner nearest the
            light and falling away toward the back. */}
        <linearGradient
          id={id("top")}
          gradientUnits="userSpaceOnUse"
          x1="18"
          y1="84"
          x2="356"
          y2="50"
        >
          <stop offset="0" stopColor={ROSE[50]} />
          <stop offset="1" stopColor={ROSE[200]} />
        </linearGradient>

        {/* The front, the middle value: lighter than the side it turns away
            from, darker than the top it sits under. */}
        <linearGradient
          id={id("front")}
          gradientUnits="userSpaceOnUse"
          x1="18"
          y1="84"
          x2="300"
          y2="300"
        >
          <stop offset="0" stopColor={ROSE[200]} />
          <stop offset="1" stopColor={ROSE[500]} />
        </linearGradient>

        <linearGradient
          id={id("trim")}
          gradientUnits="userSpaceOnUse"
          x1="244"
          y1="100"
          x2="288"
          y2="288"
        >
          <stop offset="0" stopColor={CYAN[200]} />
          <stop offset="1" stopColor={CYAN[700]} />
        </linearGradient>

        <linearGradient
          id={id("knob")}
          gradientUnits="userSpaceOnUse"
          x1="251"
          y1="125"
          x2="281"
          y2="211"
        >
          <stop offset="0" stopColor={ROSE[50]} />
          <stop offset="1" stopColor={CYAN[100]} />
        </linearGradient>

        {/* The tube surround stays near-black whatever the cabinet is wearing:
            it is the one part of the set that must not compete with the
            picture sitting inside it. */}
        <linearGradient
          id={id("rim")}
          gradientUnits="userSpaceOnUse"
          x1="16"
          y1="86"
          x2="244"
          y2="269"
        >
          <stop offset="0" stopColor="#463947" />
          <stop offset="1" stopColor="#0c090c" />
        </linearGradient>

        <linearGradient
          id={id("foot")}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="292"
          x2="0"
          y2="318"
        >
          <stop offset="0" stopColor={ROSE[700]} />
          <stop offset="1" stopColor={ROSE[900]} />
        </linearGradient>

        {/* Every 4 units, which lands near 3px at the size this renders — fine
            enough to read as a raster and coarse enough to survive the scale
            down to a phone. */}
        <pattern
          id={id("scanlines")}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="4" height="2" fill="black" opacity="0.14" />
        </pattern>
      </defs>

      <g stroke="black" strokeLinejoin="round" strokeLinecap="round">
        {/* ── Antenna ──────────────────────────────────────────────────────
            Drawn first so the rods pass behind the chassis rather than over
            it, which is what puts their feet inside the cabinet. */}
        <g strokeWidth="6">
          <line x1="212" y1="64" x2="118" y2="12" />
          <line x1="212" y1="64" x2="306" y2="18" />
        </g>
        <circle cx="118" cy="12" r="8" fill={CYAN[400]} strokeWidth="4.5" />
        <circle cx="306" cy="18" r="8" fill={CYAN[400]} strokeWidth="4.5" />

        {/* ── Feet ─────────────────────────────────────────────────────────
            Started above the cabinet's bottom edge so the front face covers
            their tops, and darker than anything above them: they are the one
            part of the set the light does not reach at all. */}
        <rect
          x="46"
          y="292"
          width="42"
          height="26"
          rx="8"
          fill={`url(#${id("foot")})`}
          strokeWidth="4"
        />
        <rect
          x="238"
          y="292"
          width="42"
          height="26"
          rx="8"
          fill={`url(#${id("foot")})`}
          strokeWidth="4"
        />

        {/* ── Cabinet ──────────────────────────────────────────────────────
            Three paints, back to front: the whole silhouette, then the top
            face over it, then the front over that. Each one only has to be
            right where it is still visible, which is what keeps three surfaces
            meeting along two creases from needing six edges to agree. */}
        <path d={SHELL} fill={`url(#${id("shell")})`} strokeWidth="6" />
        <path d={TOP} fill={`url(#${id("top")})`} strokeWidth="5" />
        <rect
          x="18"
          y="84"
          width="282"
          height="216"
          rx={CORNER}
          fill={`url(#${id("front")})`}
          strokeWidth="5"
        />

        {/* The antenna's mount, sharing the chassis' depth vector so it lies
            flat on the top face instead of floating over it, and rounded off
            like everything else. */}
        <path
          d="M 196,72 L 226,72 Q 232,72 236,69 L 250,60 Q 254,57 248,57 L 218,57 Q 212,57 208,60 L 194,69 Q 190,72 196,72 Z"
          fill={`url(#${id("trim")})`}
          strokeWidth="4"
        />

        {/* ── Screen ───────────────────────────────────────────────────────*/}
        <path d={BEZEL} fill={`url(#${id("rim")})`} strokeWidth="5" />
        {/* Black underneath the picture, so the tube still reads as a tube in
            the moment before a GIF has decoded. */}
        <path d={SCREEN} fill="black" strokeWidth="0" />

        <g clipPath={`url(#${id("screen")})`} stroke="none">
          <image
            href={noSignal.src}
            x={PICTURE.x}
            y={PICTURE.y}
            width={PICTURE.width}
            height={PICTURE.height}
            preserveAspectRatio="xMidYMid slice"
          />
          {showing && (
            <image
              key={showing.key}
              href={showing.image.src}
              x={PICTURE.x}
              y={PICTURE.y}
              width={PICTURE.width}
              height={PICTURE.height}
              preserveAspectRatio="xMidYMid slice"
            />
          )}

          <rect
            x={PICTURE.x}
            y={PICTURE.y}
            width={PICTURE.width}
            height={PICTURE.height}
            fill={`url(#${id("scanlines")})`}
          />

          {/* Two hard-edged bands rather than a soft one. The gradients on the
              cabinet describe a surface turning away from a light; glass does
              not do that, it throws the light straight back, and a blurred
              smear here would read as dirt on the tube instead. */}
          <polygon
            points="35,90 95,90 170,265 110,265"
            fill="white"
            opacity="0.1"
          />
          <polygon
            points="112,90 137,90 212,265 187,265"
            fill="white"
            opacity="0.07"
          />
        </g>

        {/* Re-struck over the picture, because the clip above cuts the image
            flush to the path and leaves the aperture with no edge of its
            own. */}
        <path d={SCREEN} fill="none" strokeWidth="5" />

        {/* ── Controls ─────────────────────────────────────────────────────*/}
        <rect
          x="244"
          y="100"
          width="44"
          height="188"
          rx="14"
          fill={`url(#${id("trim")})`}
          strokeWidth="4"
        />
        {[140, 196].map((cy) => (
          <g key={cy}>
            <circle
              cx="266"
              cy={cy}
              r="15"
              fill={`url(#${id("knob")})`}
              strokeWidth="4"
            />
            {/* Pointing somewhere specific — a knob with no indicator is a
                button. The two disagree so the set does not look printed. */}
            <line
              x1="266"
              y1={cy}
              x2={cy === 140 ? 275 : 258}
              y2={cy === 140 ? 151 : 206}
              strokeWidth="4"
            />
          </g>
        ))}
        <circle cx="266" cy="252" r="7" fill={LAMP} strokeWidth="3.5" />

        {/* ── Speaker ──────────────────────────────────────────────────────
            Across the chin, which is where the badge used to be. A blank strip
            under a tube reads as a mistake; a grille is what is actually
            behind it. */}
        <g stroke={ROSE[900]} strokeWidth="7" opacity="0.55">
          {[272, 283, 294].map((y) => (
            <line key={y} x1="48" y1={y} x2="212" y2={y} />
          ))}
        </g>
      </g>
    </svg>
  );
}
