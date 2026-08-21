import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";

/**
 * The destination is passed as a place query rather than coordinates: the DLW
 * only opened in August 2026, and a hardcoded lat/lng guessed before the map
 * providers finish indexing it would drop the pin on the wrong roof forever.
 * A name query self-corrects as their data catches up.
 */
const DESTINATION = encodeURIComponent(
  "Dining, Learning, and Well-Being Center, University of Georgia, Athens, GA",
);
const GOOGLE_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
const APPLE_MAPS_URL = `https://maps.apple.com/?daddr=${DESTINATION}`;

const STEP_CHIP_CLS =
  "mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-400 text-[0.625rem] font-bold text-black";

const CAMPUS_STEPS = [
  "From the Tate Center bus stops, walk south on S. Lumpkin St.",
  "Turn right onto E. Cloverhurst Ave — the DLW is the big new building on your right at University Ct.",
  "Driving? The Tate Deck is the closest visitor parking, about a five-minute walk away.",
];

const ROOM_STEPS = [
  "Come in through the main entrance on E. Cloverhurst Ave.",
  "Skip the stairs — dining is on floors 2 and 3, and we stay on 1.",
  "Head into the first-floor classroom hallway: Room 124 has the DevDogs sign on the door.",
];

export default function FindUs() {
  return (
    <div className="space-y-4">
      <h3 className="font-display flex items-center gap-2 text-2xl font-extrabold text-black">
        <MapPinIcon className="text-mauve-500" weight="fill" />
        How to find us
      </h3>
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-animate-stagger
      >
        <MapPanel title="Getting to the DLW" steps={CAMPUS_STEPS}>
          <CampusMap />
          <div className="mt-4 flex flex-wrap gap-2">
            <DirectionsLink href={GOOGLE_MAPS_URL}>Google Maps</DirectionsLink>
            <DirectionsLink href={APPLE_MAPS_URL}>Apple Maps</DirectionsLink>
          </div>
        </MapPanel>
        <MapPanel title="Finding Room 124" steps={ROOM_STEPS}>
          <FloorPlan />
        </MapPanel>
      </div>
    </div>
  );
}

function MapPanel({
  title,
  steps,
  children,
}: {
  title: string;
  steps: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="shadow-block-lg flex h-full flex-col gap-3 rounded-sm border-2 border-black bg-white p-5"
      data-animate="fade-up"
    >
      <h4 className="font-display text-lg leading-tight font-extrabold text-black">
        {title}
      </h4>
      {children}
      {/* The list, not the drawing, is the accessible version of the route —
          both SVGs are aria-hidden so screen readers get one copy, not two. */}
      <ol className="mt-1 flex flex-col gap-1.5 text-sm/relaxed text-mauve-600">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-2">
            <span aria-hidden className={STEP_CHIP_CLS}>
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DirectionsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
    >
      {children} <ArrowUpRightIcon />
    </a>
  );
}

/**
 * A wayfinding sketch, not a survey map: roads are straightened and blocks are
 * nudged so the route reads at a glance. Only the relationships are load-bearing
 * — the DLW sits at E. Cloverhurst Ave & University Ct, south of Baxter St,
 * west of S. Lumpkin St, below the West Campus high-rises.
 */
function CampusMap() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 480 300"
      className="w-full rounded-sm border-2 border-black"
    >
      <rect width="480" height="300" className="fill-orange-50" />

      {/* Roads: black casing under a white surface, drawn wide-then-narrow */}
      <g strokeLinecap="square">
        {/* Baxter St */}
        <line
          x1="0"
          y1="48"
          x2="480"
          y2="48"
          className="stroke-black"
          strokeWidth="16"
        />
        <line
          x1="0"
          y1="48"
          x2="480"
          y2="48"
          className="stroke-white"
          strokeWidth="11"
        />
        {/* S. Lumpkin St */}
        <line
          x1="400"
          y1="0"
          x2="400"
          y2="300"
          className="stroke-black"
          strokeWidth="16"
        />
        <line
          x1="400"
          y1="0"
          x2="400"
          y2="300"
          className="stroke-white"
          strokeWidth="11"
        />
        {/* E. Cloverhurst Ave */}
        <line
          x1="0"
          y1="228"
          x2="400"
          y2="228"
          className="stroke-black"
          strokeWidth="13"
        />
        <line
          x1="0"
          y1="228"
          x2="400"
          y2="228"
          className="stroke-white"
          strokeWidth="8"
        />
        {/* University Ct */}
        <line
          x1="148"
          y1="228"
          x2="148"
          y2="120"
          className="stroke-black"
          strokeWidth="13"
        />
        <line
          x1="148"
          y1="228"
          x2="148"
          y2="120"
          className="stroke-white"
          strokeWidth="8"
        />
      </g>

      {/* West Campus high-rises */}
      <g className="fill-white stroke-black" strokeWidth="2">
        <rect x="56" y="76" width="52" height="36" rx="2" />
        <rect x="124" y="70" width="52" height="36" rx="2" />
        <rect x="192" y="76" width="52" height="36" rx="2" />
      </g>
      <text
        x="150"
        y="128"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-600 font-semibold"
      >
        Brumby · Russell · Creswell
      </text>

      {/* Tate Center, across Lumpkin */}
      <rect
        x="418"
        y="72"
        width="52"
        height="40"
        rx="2"
        className="fill-white stroke-black"
        strokeWidth="2"
      />
      <text
        x="444"
        y="126"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-600 font-semibold"
      >
        Tate
      </text>
      <text
        x="444"
        y="138"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-600 font-semibold"
      >
        Center
      </text>

      {/* The DLW itself */}
      <rect
        x="168"
        y="146"
        width="124"
        height="68"
        rx="2"
        className="fill-rose-400 stroke-black"
        strokeWidth="3"
      />
      <text
        x="230"
        y="178"
        textAnchor="middle"
        fontSize="20"
        className="font-display fill-black font-extrabold"
      >
        DLW
      </text>
      <text
        x="230"
        y="196"
        textAnchor="middle"
        fontSize="9"
        className="fill-black font-semibold"
      >
        Dining, Learning &amp; Well-Being
      </text>

      {/* Walking route: Tate → south on Lumpkin → west on Cloverhurst → door */}
      <path
        d="M 418 108 L 400 122 L 400 228 L 240 228 L 240 218"
        fill="none"
        className="stroke-rose-600"
        strokeWidth="3"
        strokeDasharray="7 5"
        strokeLinejoin="round"
      />
      <path d="M 240 212 l -6 9 h 12 z" className="fill-rose-600" />

      {/* Road labels */}
      <text x="10" y="38" fontSize="11" className="fill-mauve-700 font-bold">
        Baxter St
      </text>
      <text x="10" y="220" fontSize="11" className="fill-mauve-700 font-bold">
        E. Cloverhurst Ave
      </text>
      <text
        x="412"
        y="296"
        fontSize="11"
        transform="rotate(-90 412 296)"
        className="fill-mauve-700 font-bold"
      >
        S. Lumpkin St
      </text>
      <text
        x="140"
        y="222"
        fontSize="9"
        transform="rotate(-90 140 222)"
        className="fill-mauve-500 font-semibold"
      >
        University Ct
      </text>

      {/* Compass */}
      <text
        x="24"
        y="284"
        textAnchor="middle"
        fontSize="13"
        className="font-display fill-black font-extrabold"
      >
        N ↑
      </text>
    </svg>
  );
}

/**
 * Schematic, not measured: the first floor really does split into a classroom
 * wing and a health & well-being wing with dining upstairs (that comes from the
 * architects' program), but the corridor shape and where 124 falls along it are
 * sketched. If the room ever moves or the wing flips, redraw here and reword
 * ROOM_STEPS together — the numbered chips on the route are steps 1–3 of that
 * list.
 */
function FloorPlan() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 480 300"
      className="w-full rounded-sm border-2 border-black"
    >
      <rect width="480" height="300" className="fill-orange-50" />

      {/* Building shell */}
      <rect
        x="36"
        y="24"
        width="408"
        height="228"
        className="fill-white stroke-black"
        strokeWidth="3"
      />

      {/* Health & well-being wing */}
      <rect
        x="52"
        y="40"
        width="150"
        height="102"
        rx="2"
        className="fill-orange-100 stroke-black"
        strokeWidth="2"
      />
      <text
        x="127"
        y="86"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Health &amp;
      </text>
      <text
        x="127"
        y="99"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Well-Being wing
      </text>

      {/* Stairs up to dining */}
      <rect
        x="52"
        y="170"
        width="106"
        height="62"
        rx="2"
        className="fill-orange-200 stroke-black"
        strokeWidth="2"
      />
      <text
        x="105"
        y="196"
        textAnchor="middle"
        fontSize="10"
        className="fill-black font-semibold"
      >
        Stairs ↑
      </text>
      <text
        x="105"
        y="209"
        textAnchor="middle"
        fontSize="9"
        className="fill-mauve-700"
      >
        dining, floors 2–3
      </text>

      {/* Classroom wing along the top of the corridor */}
      <g className="fill-white stroke-black" strokeWidth="2">
        <rect x="218" y="40" width="64" height="102" rx="2" />
        <rect x="288" y="40" width="64" height="102" rx="2" />
      </g>
      <rect
        x="358"
        y="40"
        width="70"
        height="102"
        rx="2"
        className="fill-rose-400 stroke-black"
        strokeWidth="3"
      />
      <text
        x="250"
        y="96"
        textAnchor="middle"
        fontSize="12"
        className="fill-mauve-500 font-bold"
      >
        120
      </text>
      <text
        x="320"
        y="96"
        textAnchor="middle"
        fontSize="12"
        className="fill-mauve-500 font-bold"
      >
        122
      </text>
      <text
        x="393"
        y="90"
        textAnchor="middle"
        fontSize="16"
        className="font-display fill-black font-extrabold"
      >
        124
      </text>
      <text
        x="393"
        y="106"
        textAnchor="middle"
        fontSize="9"
        className="fill-black font-semibold"
      >
        DevDogs
      </text>

      {/* Corridor + lobby labels sit in the leftover white */}
      <text
        x="322"
        y="178"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-400 font-semibold tracking-wide"
      >
        CLASSROOM HALLWAY
      </text>
      <text
        x="240"
        y="226"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-400 font-semibold tracking-wide"
      >
        LOBBY
      </text>

      {/* Door gap in the shell, then the entrance callout below it */}
      <line
        x1="216"
        y1="252"
        x2="264"
        y2="252"
        className="stroke-white"
        strokeWidth="5"
      />
      <text
        x="240"
        y="286"
        textAnchor="middle"
        fontSize="10"
        className="fill-mauve-700 font-bold"
      >
        Main entrance — E. Cloverhurst Ave
      </text>

      {/* Route: in the door, across the lobby, right down the hallway to 124 */}
      <path
        d="M 240 268 L 240 155 L 393 155 L 393 148"
        fill="none"
        className="stroke-rose-600"
        strokeWidth="3"
        strokeDasharray="7 5"
        strokeLinejoin="round"
      />
      <path d="M 393 142 l -6 9 h 12 z" className="fill-rose-600" />
      <g className="fill-rose-600">
        <circle cx="240" cy="245" r="8" />
        <circle cx="240" cy="192" r="8" />
        <circle cx="330" cy="155" r="8" />
      </g>
      <g textAnchor="middle" fontSize="10" className="fill-white font-bold">
        <text x="240" y="248.5">
          1
        </text>
        <text x="240" y="195.5">
          2
        </text>
        <text x="330" y="158.5">
          3
        </text>
      </g>
    </svg>
  );
}
