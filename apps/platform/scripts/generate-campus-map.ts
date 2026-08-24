/**
 * Regenerates `src/components/EventsSection/FindUs/campusMapData.ts` (and the
 * few bytes in `campusMapMeta.ts` beside it) from live OpenStreetMap data —
 * run with `pnpm exec tsx scripts/generate-campus-map.ts`.
 *
 * The Directions dialog's campus map is real geometry, not a sketch: every
 * building footprint and road in the frame, pulled via Overpass and projected
 * equirectangular into an SVG viewBox. The DLW's own footprint is exported
 * separately so the component can highlight it, along with its centroid in
 * lat/lon — the pin the Google/Apple Maps links drop, since the building is
 * too new for a name search to resolve reliably. Rerun this when OSM improves
 * the area (the DLW is brand new) or to reframe; the landmark labels live in
 * CampusMap.tsx and are placed by eye against these coordinates, so check the
 * rendered map after regenerating — the script prints each labeled building's
 * centroid to help.
 *
 * Two output files because the map is loaded on demand: the path strings are
 * the weight, so they live in campusMapData.ts behind a dynamic import, while
 * the viewBox and the DLW's coordinates — needed by the eagerly loaded dialog
 * for the placeholder and the Google/Apple Maps links — go in campusMapMeta.ts.
 *
 * OSM data is ODbL — the map must keep its visible "© OpenStreetMap"
 * attribution (FindUs.tsx renders it in the SVG corner).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Query bbox (S, W, N, E) — generous so roads at the frame's edge arrive
 * whole instead of clipped mid-way. */
const QUERY_BBOX = [33.9355, -83.39, 33.957, -83.363] as const;

/**
 * Rendered frame: the Main Library north, Driftmier south, Brumby west, past
 * Sanford Stadium east.
 *
 * The south edge is what set this. A meeting can now name the building it is
 * in, and the list runs from the Main Library at 33.9540 down to Driftmier at
 * 33.9388 — 1.7 km of campus, against the 930 m the old frame covered. Every
 * building an officer can pick has to be ON the map, or the highlight has
 * nothing to point at, so the frame is a consequence of that list rather than
 * a composition choice.
 *
 * That makes the map portrait where it used to be landscape. The longitude
 * span is widened past what the buildings strictly need — there is real campus
 * out to the east, and none of it is wasted — to keep the aspect near 1.13
 * rather than the 1.55 the buildings alone would force.
 */
const S = 33.9372,
  N = 33.9552,
  W = -83.3861,
  E = -83.3668;
const VW = 480;

/** Roads drawn with full casing, vs. thin service/pedestrian connectors. */
const MAJOR_HIGHWAYS = new Set([
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
]);
const MINOR_HIGHWAYS = new Set(["service", "pedestrian"]);

/**
 * Every building a meeting can name, and what OSM calls it.
 *
 * `key` is the value stored in `platform.meetings.building` and offered in the
 * Airtable dropdown — students' shorthand, because an officer picking from a
 * list should see what they would say out loud. `osm` is the name tag, which
 * is frequently neither ("Miller Plant Science", "Shirley Mathis McBay Science
 * Library"), and the two are mapped here rather than anywhere else so the
 * dropdown never has to spell a building the way a mapper did.
 *
 * `via` is load-bearing. OSM models a building either as a closed way or as a
 * multipolygon relation over several ways, and this script only ever asked for
 * ways — so Driftmier, Brooks Hall, the Ramsey Center, Lamar Dodd, Ecology and
 * the vet school have been silently absent from the map, not merely
 * un-highlighted. A relation's geometry does not come back from `out geom`
 * either (Overpass returns its tags and an empty member list), so those are
 * fetched a second time through their member ways. See `fetchRelationWays`.
 */
const HIGHLIGHTS = [
  { key: "DLW", osm: "Dining, Learning and Well-being Center", via: "way" },
  { key: "Driftmier", osm: "Driftmier Engineering Center", via: "relation" },
  { key: "Plant Sciences", osm: "Miller Plant Science", via: "way" },
  { key: "Boyd", osm: "Boyd Graduate Research Center", via: "way" },
  { key: "MLC", osm: "Zell B. Miller Student Learning Center", via: "way" },
  {
    key: "Science Learning Center",
    osm: "Science Learning Center",
    via: "way",
  },
  {
    key: "Science Library",
    osm: "Shirley Mathis McBay Science Library",
    via: "way",
  },
  { key: "Poultry Science", osm: "Poultry Science Building", via: "way" },
  { key: "Main Library", osm: "UGA Main Library", via: "way" },
  { key: "Tate", osm: "Tate Student Center", via: "way" },
] as const satisfies readonly {
  key: string;
  osm: string;
  via: "way" | "relation";
}[];

/**
 * Buildings CampusMap.tsx labels that are not already highlightable — the
 * landmarks somebody orients by rather than meets in.
 *
 * Every highlightable building is labelled too; they are not repeated here.
 * The script prints a centroid for each name in both lists, which is what
 * those labels are placed against.
 */
const LANDMARKS = [
  "Brumby Hall",
  "Russell Hall",
  "Creswell Hall",
  "Bolton Dining Commons",
  "Tate Center Parking Deck",
  "Oglethorpe House",
  "Physics Building",
  "Snelling Dining Commons",
  "Journalism Building",
  "Sanford Stadium",
  "Stegeman Coliseum",
  "Aderhold Hall",
  "Food Science Building",
  "Paul D. Coverdell Center",
  "Conner Hall",
  "Memorial Hall",
];

interface OsmGeomPoint {
  lat: number;
  lon: number;
}
interface OsmWay {
  id: number;
  tags?: Record<string, string>;
  geometry: OsmGeomPoint[];
}

const latMid = (S + N) / 2;
const kx = Math.cos((latMid * Math.PI) / 180);
const wDeg = (E - W) * kx;
const hDeg = N - S;
const VH = Math.round((VW * hDeg) / wDeg);

const px = (lon: number, lat: number): [number, number] => [
  (((lon - W) * kx) / wDeg) * VW,
  ((N - lat) / hDeg) * VH,
];
const fmt = (n: number) => Math.round(n * 10) / 10;

/** Drop points within 2.5px of the last kept one — subpixel wiggle isn't
 * worth the payload bytes at this scale. */
function simplify(pts: [number, number][]): [number, number][] {
  const kept = [pts[0]!];
  for (const p of pts.slice(1)) {
    const [lx, ly] = kept[kept.length - 1]!;
    if (Math.hypot(p[0] - lx, p[1] - ly) > 2.5) kept.push(p);
  }
  const last = pts[pts.length - 1]!;
  const tail = kept[kept.length - 1]!;
  if (tail[0] !== last[0] || tail[1] !== last[1]) kept.push(last);
  return kept;
}

const proj = (geom: OsmGeomPoint[]) =>
  geom.map((g) => px(g.lon, g.lat).map(fmt) as [number, number]);
const toPath = (geom: OsmGeomPoint[], close: boolean) =>
  "M" +
  simplify(proj(geom))
    .map((p) => p.join(" "))
    .join("L") +
  (close ? "Z" : "");

/** Entirely outside the frame (with slack for stroke width)? Skip it. */
function inFrame(geom: OsmGeomPoint[]): boolean {
  return geom.some((g) => {
    const [x, y] = px(g.lon, g.lat);
    return x > -8 && x < VW + 8 && y > -8 && y < VH + 8;
  });
}

/** Shoelace area in px² — used to drop sheds too small to read as buildings. */
function area(geom: OsmGeomPoint[]): number {
  const pts = proj(geom);
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j]![0] + pts[i]![0]) * (pts[j]![1] - pts[i]![1]);
  }
  return Math.abs(a / 2);
}

/**
 * One Overpass round trip, with retries.
 *
 * The public instance answers 504 or hands back an XML error page under load
 * often enough that a single attempt is not a reliable build step, and the
 * failure is not always an HTTP status — a 200 whose body starts with `<?xml`
 * is an error too, so the body is checked rather than only `res.ok`.
 */
async function overpass(query: string): Promise<OsmWay[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 8000 * attempt));
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass 406s requests that don't identify themselves.
        "User-Agent": "devdogs-platform-campus-map (devdogsuga.org)",
      },
      body: "data=" + encodeURIComponent(query),
    });
    const text = await res.text();
    if (!res.ok || text.startsWith("<")) {
      console.warn(
        `  overpass attempt ${attempt + 1} failed (${res.status})${text.startsWith("<") ? " — XML error body" : ""}`,
      );
      continue;
    }
    return (JSON.parse(text) as { elements: OsmWay[] }).elements;
  }
  throw new Error("Overpass did not answer after 4 attempts");
}

/** Ways, plus the member ways of every building relation, as plain footprints. */
async function fetchOsm(): Promise<OsmWay[]> {
  const bbox = QUERY_BBOX.join(",");
  const ways = await overpass(`[out:json][timeout:90];
(
  way["highway"~"${[...MAJOR_HIGHWAYS, ...MINOR_HIGHWAYS].join("|")}"](${bbox});
  way["building"](${bbox});
  way["leisure"="stadium"](${bbox});
);
out geom tags;`);

  // A multipolygon's members carry no name and usually no `building` tag, so
  // they arrive here tagged by hand — enough to be drawn as ordinary
  // footprints. Which relation each one belonged to is not recoverable from
  // this query and is not needed: the named ones are fetched again below.
  const relWays = await overpass(`[out:json][timeout:90];
relation["building"](${bbox});
way(r);
out geom;`);

  const seen = new Set(ways.map((w) => w.id));
  for (const w of relWays) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    ways.push({ ...w, tags: { ...w.tags, building: "yes" } });
  }
  return ways;
}

/**
 * The member ways of one named building relation.
 *
 * Needed because `out geom` on a relation returns its tags and an EMPTY member
 * list — verified against the public instance — so there is no single query
 * that yields a named multipolygon's geometry. Asking for the relation and
 * then its ways is the way through.
 */
async function fetchRelationWays(name: string): Promise<OsmWay[]> {
  return overpass(`[out:json][timeout:90];
relation["building"]["name"="${name}"](${QUERY_BBOX.join(",")});
way(r);
out geom;`);
}

console.log("fetching OSM…");
const elements = await fetchOsm();

const roadPaths = { major: [] as string[], minor: [] as string[] };
for (const e of elements) {
  const hw = e.tags?.highway;
  if (!hw || !inFrame(e.geometry)) continue;
  // A pedestrian way tagged area=yes is a plaza polygon, not a path.
  if (e.tags?.area === "yes") continue;
  if (MAJOR_HIGHWAYS.has(hw)) roadPaths.major.push(toPath(e.geometry, false));
  else if (MINOR_HIGHWAYS.has(hw))
    roadPaths.minor.push(toPath(e.geometry, false));
}

/** Area-weighted polygon centroid in lat/lon — a vertex average would drift
 * toward whichever wall OSM mapped with the most nodes. */
function centroid(geom: OsmGeomPoint[]): { lat: number; lon: number } {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0, j = geom.length - 1; i < geom.length; j = i++) {
    const p = geom[j]!,
      q = geom[i]!;
    const f = p.lon * q.lat - q.lon * p.lat;
    a += f;
    cx += (p.lon + q.lon) * f;
    cy += (p.lat + q.lat) * f;
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: round(cy / (3 * a)), lon: round(cx / (3 * a)) };
}

/**
 * Every footprint in the frame, highlightable ones INCLUDED.
 *
 * The old script held the DLW out of this set because the DLW was the only
 * building the map could highlight, and it was always highlighted. Now that
 * the highlight moves, a building left out of here would vanish from the map
 * entirely on every meeting held somewhere else. So everything is drawn once
 * as an ordinary footprint and the highlight is painted over the top of it.
 */
const footprints: string[] = [];
for (const e of elements) {
  // Sanford Stadium is tagged leisure=stadium rather than building.
  if (!(e.tags?.building ?? e.tags?.leisure === "stadium")) continue;
  if (!inFrame(e.geometry) || area(e.geometry) < 12) continue;
  footprints.push(toPath(e.geometry, true));
}

interface Highlight {
  path: string;
  center: { lat: number; lon: number };
  pin: { x: number; y: number };
}

const highlights: Record<string, Highlight> = {};
for (const b of HIGHLIGHTS) {
  // A relation's ways are several pieces of one building, so the path is all
  // of them and the centre comes from the biggest — averaging across an
  // L-shaped building's wings puts the pin in the courtyard between them.
  const geoms: OsmGeomPoint[][] =
    b.via === "relation"
      ? (await fetchRelationWays(b.osm)).map((w) => w.geometry)
      : elements
          .filter(
            (e) =>
              (e.tags?.building ?? e.tags?.leisure === "stadium") &&
              e.tags?.name === b.osm,
          )
          .map((e) => e.geometry);

  if (geoms.length === 0) throw new Error(`no OSM footprint for "${b.osm}"`);

  const biggest = geoms.reduce((a, g) => (area(g) > area(a) ? g : a));
  const center = centroid(biggest);
  const [pinX, pinY] = px(center.lon, center.lat).map(fmt) as [number, number];
  highlights[b.key] = {
    path: geoms.map((g) => toPath(g, true)).join(""),
    center,
    pin: { x: pinX, y: pinY },
  };
}

const labeled = [...HIGHLIGHTS.map((b) => b.osm), ...LANDMARKS].map((name) => {
  const b = elements.find(
    (e) =>
      (e.tags?.building ?? e.tags?.leisure === "stadium") &&
      e.tags?.name === name,
  );
  // A relation-backed building has no named way, so fall back to the pin the
  // highlight pass already resolved rather than failing the run.
  if (!b) {
    const h = HIGHLIGHTS.find((x) => x.osm === name);
    const pin = h ? highlights[h.key]?.pin : undefined;
    if (!pin) throw new Error(`no OSM building found for "${name}"`);
    return { name, cx: pin.x, cy: pin.y };
  }
  const c = b.geometry.reduce<[number, number]>(
    (a, g) => [a[0] + g.lon, a[1] + g.lat],
    [0, 0],
  );
  const [cx, cy] = px(c[0] / b.geometry.length, c[1] / b.geometry.length).map(
    fmt,
  );
  return { name, cx, cy };
});

const header = `// GENERATED by scripts/generate-campus-map.ts — do not edit by hand.
// Map data © OpenStreetMap contributors, ODbL — openstreetmap.org/copyright
// Frame: lat ${S}..${N}, lon ${W}..${E}, equirectangular, ${VW}x${VH}.
`;

const keys = HIGHLIGHTS.map((b) => b.key);
const entries = (pick: (h: Highlight) => unknown) =>
  JSON.stringify(
    Object.fromEntries(keys.map((k) => [k, pick(highlights[k]!)])),
    null,
    2,
  );

const meta = `${header}
/** The map's viewBox — also what sizes its placeholder before it loads. */
export const VIEW = { w: ${VW}, h: ${VH} };

/** Every building a meeting can name. The map highlights exactly one of them. */
export const BUILDING_KEYS = ${JSON.stringify(keys)} as const;

export type BuildingKey = (typeof BUILDING_KEYS)[number];

/**
 * Each building's footprint centroid — where the Google/Apple Maps links drop
 * their pin. A coordinate rather than a place query because the DLW is too new
 * for either app to resolve by name, and a coordinate behaves the same for all
 * ten.
 */
export const BUILDING_CENTERS: Record<
  BuildingKey,
  { lat: number; lon: number }
> = ${entries((h) => h.center)};
`;

const out = `${header}
/** Cased streets, one subpath per OSM way. */
export const MAJOR_ROADS = ${JSON.stringify(roadPaths.major.join(""))};

/** Service drives and pedestrian connectors, drawn thin. */
export const MINOR_ROADS = ${JSON.stringify(roadPaths.minor.join(""))};

/** Every building footprint in the frame, highlightable ones included. */
export const FOOTPRINTS = ${JSON.stringify(footprints.join(""))};

/** The footprint the map paints on top, one per building a meeting can name. */
export const HIGHLIGHT_PATHS: Record<string, string> = ${entries((h) => h.path)};

/** Where the pin goes, in viewBox units — the centroid of the same footprint. */
export const HIGHLIGHT_PINS: Record<string, { x: number; y: number }> = ${entries((h) => h.pin)};
`;

const dir = join(import.meta.dirname, "../src/components/EventsSection/FindUs");
writeFileSync(join(dir, "campusMapData.ts"), out);
writeFileSync(join(dir, "campusMapMeta.ts"), meta);
console.log(
  `wrote ${dir}/campusMapData.ts (${(out.length / 1024).toFixed(1)}KB) + campusMapMeta.ts`,
);
console.log(
  `viewBox 0 0 ${VW} ${VH} | ${roadPaths.major.length} major ways, ${roadPaths.minor.length} minor ways, ${footprints.length} footprints`,
);
for (const b of labeled) console.log(`  LABEL ${b.name} → ${b.cx},${b.cy}`);
for (const k of keys)
  console.log(`  PIN ${k} → ${highlights[k]!.pin.x},${highlights[k]!.pin.y}`);
