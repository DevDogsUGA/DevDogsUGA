"use client";
import { useEffect, useId, useLayoutEffect, useRef } from "react";

export type EdgeType = "flat" | "bs" | "fs";

export interface BlobDef {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  fill: string;
  opacity?: number;
}

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
  base: string;
  blobs: BlobDef[];
  blurSd?: number;
  className?: string;
}

// useLayoutEffect synchronises the clip path before the first paint in the browser,
// but falls back to useEffect on the server (where useLayoutEffect is a no-op anyway).
const useSafeLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Parallax speed per blob slot. Alternating sign creates opposing depth layers.
const PARALLAX_FACTORS = [0.18, -0.13, 0.1, -0.16, 0.12] as const;

export default function SectionBackground({
  topEdge,
  bottomEdge,
  base,
  blobs,
  blurSd = 45,
  className,
}: Props) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const parallaxRefs = useRef<(SVGGElement | null)[]>([]);

  useSafeLayoutEffect(() => {
    const container = containerRef.current;
    const clip = clipRef.current;
    if (!container || !clip) return;

    function update() {
      const W = container!.clientWidth;
      const H = container!.clientHeight;
      const angle = window.innerWidth >= 768 ? 4 : 2;
      const S = Math.tan((angle * Math.PI) / 180) * W;
      const cs = getComputedStyle(container!);
      const radii: [number, number, number, number] = [
        parseFloat(cs.borderTopLeftRadius),
        parseFloat(cs.borderTopRightRadius),
        parseFloat(cs.borderBottomRightRadius),
        parseFloat(cs.borderBottomLeftRadius),
      ];
      clip!.setAttribute("d", buildPath(W, H, S, topEdge, bottomEdge, radii));
    }

    const ro = new ResizeObserver(update);
    ro.observe(container);
    update();
    return () => ro.disconnect();
  }, [topEdge, bottomEdge]);

  // Scroll-driven parallax: each blob moves at a different rate, creating depth.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;

    function onScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = container!.getBoundingClientRect();
        const viewH = window.innerHeight;
        const progress = (viewH / 2 - (rect.top + rect.height / 2)) / viewH;

        parallaxRefs.current.forEach((g, i) => {
          if (!g) return;
          const factor = PARALLAX_FACTORS[i % PARALLAX_FACTORS.length]!;
          const dy = (progress * factor * viewH).toFixed(1);
          g.setAttribute("transform", `translate(0,${dy})`);
        });
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const clipId = `sc-${id}`;
  const filtId = `sf-${id}`;

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 ${className ?? "rounded-xl"}`}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <path ref={clipRef} />
          </clipPath>
          <filter id={filtId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={blurSd} />
          </filter>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="100%" height="100%" fill={base} />
          <g filter={`url(#${filtId})`}>
            {blobs.map((b, i) => (
              <g
                key={i}
                ref={(el) => {
                  parallaxRefs.current[i] = el;
                }}
                style={{ willChange: "transform" }}
              >
                <ellipse
                  cx={b.cx}
                  cy={b.cy}
                  rx={b.rx}
                  ry={b.ry}
                  fill={b.fill}
                  opacity={b.opacity ?? 0.65}
                />
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

// ── public helpers (reusable for CSS clip-path: path() on host elements) ────

export function buildSectionPath(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
  r = 12,
): string {
  return buildPath(W, H, S, top, bot, [r, r, r, r]);
}

// ── internal helpers ─────────────────────────────────────────────────────────

function getVertices(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
): [number, number][] {
  // bs top: right dips to S (\); fs top: left dips to S (/)
  const tl: [number, number] = top === "fs" ? [0, S] : [0, 0];
  const tr: [number, number] = top === "bs" ? [W, S] : [W, 0];
  // fs bottom: right dips to H-S (/); bs bottom: left dips to H-S (\)
  const br: [number, number] = bot === "fs" ? [W, H - S] : [W, H];
  const bl: [number, number] = bot === "bs" ? [0, H - S] : [0, H];
  return [tl, tr, br, bl];
}

function buildPath(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
  radii: [number, number, number, number] = [12, 12, 12, 12],
): string {
  const verts = getVertices(W, H, S, top, bot);
  const n = verts.length;
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]!;
    const curr = verts[i]!;
    const next = verts[(i + 1) % n]!;

    const inX = curr[0] - prev[0];
    const inY = curr[1] - prev[1];
    const outX = next[0] - curr[0];
    const outY = next[1] - curr[1];
    const inL = Math.sqrt(inX * inX + inY * inY);
    const outL = Math.sqrt(outX * outX + outY * outY);
    const ri = Math.min(radii[i]!, inL / 2, outL / 2);

    const sx = curr[0] - (ri * inX) / inL;
    const sy = curr[1] - (ri * inY) / inL;
    const ex = curr[0] + (ri * outX) / outL;
    const ey = curr[1] + (ri * outY) / outL;

    parts.push(i === 0 ? `M ${f(sx)} ${f(sy)}` : `L ${f(sx)} ${f(sy)}`);
    parts.push(`Q ${f(curr[0])} ${f(curr[1])} ${f(ex)} ${f(ey)}`);
  }
  return parts.join(" ") + " Z";
}

const f = (n: number) => Math.round(n * 10) / 10;
