"use client";

import { useId } from "react";
import type { StaticImageData } from "next/image";

/**
 * A CRT television, drawn rather than photographed, with a live screen.
 *
 * ## Why it is a drawing and not an image
 *
 * A photo or a stock render would be the only piece of the site not built out
 * of the same parts as everything else: flat fills, black outlines, offset
 * block shadows. Vector also means the screen aperture is a *known shape* at
 * every size, which is the thing that actually makes this work — see below.
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
 * The chassis, in viewBox units. Written down rather than inlined because the
 * three faces have to agree: the top and side are the front face translated
 * along one depth vector, and an edge that disagrees by a unit reads as a
 * dent rather than as a corner.
 *
 * Front face:  x 18…300, y 84…300
 * Depth:       +56 x, −34 y  (back and up, so the tube is seen from below-left)
 */
const TOP_FACE = "18,84 300,84 356,50 74,50";
const SIDE_FACE = "300,84 356,50 356,266 300,300";
const SILHOUETTE = "18,84 74,50 356,50 356,266 300,300 18,300";

/**
 * The aperture: four quadratic curves, one per edge, each bowing outward.
 *
 * The corners are deliberately left as corners. A tube is not a rounded
 * rectangle — it is a rectangle pushed out from behind — and rounding the
 * joins here turns it into a bar of soap.
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

// Flat fills, one per face, doing all of the work that a light source would do
// in a render. Mauve rather than anything warmer on purpose: `meetingView`
// spends real colour on meaning — cyan is a competition, amber is a workshop —
// and a big amber television parked beside an amber Workshop chip would read
// as a third kind of badge. The one saturated thing on it is the power lamp,
// in rose, which is not a segment colour anywhere.
const FACE_TOP = "#f3f1f3"; // mauve-100
const FACE_FRONT = "#e7e4e7"; // mauve-200
const FACE_SIDE = "#a89ea9"; // mauve-400
const TRIM = "#d7d0d7"; // mauve-300
const GRILLE = "#79697b"; // mauve-500
const LAMP = "#f43f5e"; // rose-500

export default function CrtTv({ noSignal, showing, className }: Props) {
  // Strip everything that is not alphanumeric rather than just the colons the
  // rest of the codebase strips: React 19 hands back `«r0»`, not `:r0:`, so a
  // colon-only replace is now a no-op and these ids end up inside `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const screenClip = `crt-screen-${uid}`;
  const scanlines = `crt-scanlines-${uid}`;

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
        <clipPath id={screenClip}>
          <path d={SCREEN} />
        </clipPath>

        {/* Every 4 units, which lands near 3px at the size this renders — fine
            enough to read as a raster and coarse enough to survive the scale
            down to a phone. */}
        <pattern
          id={scanlines}
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
        <circle cx="118" cy="12" r="8" fill={FACE_FRONT} strokeWidth="4.5" />
        <circle cx="306" cy="18" r="8" fill={FACE_FRONT} strokeWidth="4.5" />

        {/* ── Feet ─────────────────────────────────────────────────────────
            Started above the cabinet's bottom edge so the front face covers
            their tops: a foot butted exactly against the edge shows a seam the
            moment the stroke rounds a join. */}
        <polygon
          points="46,292 88,292 82,318 52,318"
          fill={FACE_SIDE}
          strokeWidth="4"
        />
        <polygon
          points="238,292 280,292 274,318 244,318"
          fill={FACE_SIDE}
          strokeWidth="4"
        />

        {/* ── Chassis ──────────────────────────────────────────────────────
            Painted face by face, then outlined once around the whole
            silhouette, so the outer edge is a single unbroken weight and the
            two internal creases sit lighter inside it. */}
        <polygon points={TOP_FACE} fill={FACE_TOP} strokeWidth="4" />
        <polygon points={SIDE_FACE} fill={FACE_SIDE} strokeWidth="4" />
        <rect
          x="18"
          y="84"
          width="282"
          height="216"
          fill={FACE_FRONT}
          strokeWidth="4"
        />
        <polygon points={SILHOUETTE} fill="none" strokeWidth="6" />

        {/* The antenna's mount, a parallelogram sharing the chassis' depth
            vector so it lies flat on the top face instead of floating over
            it. */}
        <polygon
          points="190,72 230,72 246,62 206,62"
          fill={TRIM}
          strokeWidth="4"
        />

        {/* ── Screen ───────────────────────────────────────────────────────*/}
        <path d={BEZEL} fill={TRIM} strokeWidth="4" />
        {/* Black underneath the picture, so the tube still reads as a tube in
            the moment before a GIF has decoded. */}
        <path d={SCREEN} fill="black" strokeWidth="0" />

        <g clipPath={`url(#${screenClip})`} stroke="none">
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
            fill={`url(#${scanlines})`}
          />

          {/* Two hard-edged bands rather than a soft gradient: the rest of the
              page has no gradients in it, and a blurred highlight would be the
              only soft thing on a page of flat fills and hard outlines. */}
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
          rx="6"
          fill={TRIM}
          strokeWidth="4"
        />
        {[134, 180].map((cy) => (
          <g key={cy}>
            <circle cx="266" cy={cy} r="15" fill={FACE_TOP} strokeWidth="4" />
            {/* Pointing somewhere specific — a knob with no indicator is a
                button. The two disagree so the set does not look printed. */}
            <line
              x1="266"
              y1={cy}
              x2={cy === 134 ? 275 : 258}
              y2={cy === 134 ? 145 : 190}
              strokeWidth="4"
            />
          </g>
        ))}
        <g stroke={GRILLE} strokeWidth="5">
          {[212, 224, 236, 248].map((y) => (
            <line key={y} x1="254" y1={y} x2="278" y2={y} />
          ))}
        </g>
        <circle cx="266" cy="270" r="6" fill={LAMP} strokeWidth="3.5" />

        {/* ── Badge ────────────────────────────────────────────────────────*/}
        <rect
          x="40"
          y="270"
          width="112"
          height="21"
          rx="4"
          fill={TRIM}
          strokeWidth="4"
        />
      </g>

      <text
        x="96"
        y="285"
        textAnchor="middle"
        className="font-display"
        fontSize="13"
        fontWeight="800"
        letterSpacing="2"
        fill={GRILLE}
      >
        DEVDOGS
      </text>
    </svg>
  );
}
