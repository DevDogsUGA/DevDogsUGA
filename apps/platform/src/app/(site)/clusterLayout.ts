export interface CardLayout {
  cx: number;
  cy: number;
  deg: number;
  tx: number;
  ty: number;
}

// Semi-circle opens upward (∩). Center is below the container; outer rings arc higher.
// Profiles are assigned outer→inner so earlier list entries appear closer to the top.
const SEMI_CENTER_Y = +280;
const RINGS = [
  { r: 140, thetaMin: 22 }, // inner  — bottom, fewest slots (~22% of n, capacity ≤ 3)
  { r: 330, thetaMin: 15 }, // middle
  { r: 520, thetaMin: 40 }, // outer  — top, most slots; 40° keeps cx ≤ 400
] as const;
// Half of the chord clearance between adjacent cards on the same ring.
// 156px = 120px card width + 20px margin + ~16px rotation-induced expansion at max tilt.
const HALF_CLEARANCE = 78;
// Cards tilt proportional to the arc tangent at their position (0° at apex, growing
// toward the sides). Scale keeps the maximum tilt readable — ~15° at the widest spread.
const TILT_SCALE = 0.2;
const SEED_JITTER = 0xa5e3f1b2;
const SEED_SCT = 0x3c7d92e4;

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeClusterLayout(
  n: number,
  _containerW: number,
  _containerH: number,
): CardLayout[] {
  const DEG = Math.PI / 180;

  // n0 is the smallest group — it goes to the inner ring which has the least capacity.
  // n2 goes to the outer ring (most capacity). Sizes are proportional to circumference.
  const n0 = Math.max(1, Math.round(n * 0.22));
  const n1 = Math.max(1, Math.round(n * 0.42));
  const n2 = n - n0 - n1;
  const ringCounts = [n0, n1, n2]; // indexed by ring k (0=inner/bottom … 2=outer/top)

  const jitterRand = mulberry32(SEED_JITTER);
  const scatterRand = mulberry32(SEED_SCT);

  // Build positions for each ring independently so we can assign them to profile
  // indices in outer→inner order (earlier profiles land on higher-up rings).
  const ringLayouts: CardLayout[][] = [[], [], []];

  for (let k = 0; k < RINGS.length; k++) {
    const { r, thetaMin } = RINGS[k]!;
    const n_k = ringCounts[k]!;
    if (n_k <= 0) continue;

    const thetaMinRad = thetaMin * DEG;

    // Minimum angular gap so the effective chord (accounting for rotation-induced
    // bounding-box expansion) stays ≥ HALF_CLEARANCE * 2.
    const deltaTheta = 2 * Math.asin(HALF_CLEARANCE / r);

    // Spread symmetrically around θ=90° (apex), clamped to the ring's safe range.
    const span = (n_k - 1) * deltaTheta;
    const thetaStart = Math.max(thetaMinRad, Math.PI / 2 - span / 2);
    const thetaEnd = Math.min(Math.PI - thetaMinRad, Math.PI / 2 + span / 2);

    for (let j = 0; j < n_k; j++) {
      const baseTheta =
        n_k === 1
          ? Math.PI / 2
          : thetaStart + (thetaEnd - thetaStart) * (j / (n_k - 1));

      // ±3° positional jitter for organic feel.
      const theta = baseTheta + (jitterRand() * 6 - 3) * DEG;

      // Tilt follows the arc tangent: 0° at apex (θ=90°), growing toward the sides.
      // Cards lean outward — right-side profiles tilt right (CW), left-side tilt left (CCW).
      const deg = (Math.PI / 2 - theta) * (180 / Math.PI) * TILT_SCALE;

      ringLayouts[k]!.push({
        cx: Math.round(r * Math.cos(theta)),
        cy: Math.round(SEMI_CENTER_Y - r * Math.sin(theta)),
        deg,
        tx: Math.round(scatterRand() * 8 - 4), // ±4px
        ty: Math.round(scatterRand() * 8 - 4), // ±4px
      });
    }
  }

  // Flatten all ring positions, then sort by cy ascending so the highest positions
  // (smallest cy) map to the earliest profile indices. Ties broken by |cx| so the
  // center slot comes before symmetric side slots at the same height.
  const layouts: CardLayout[] = ([] as CardLayout[]).concat(...ringLayouts);
  layouts.sort((a, b) =>
    a.cy !== b.cy ? a.cy - b.cy : Math.abs(a.cx) - Math.abs(b.cx),
  );
  return layouts;
}
