/** The route the floor plan's numbered chips draw. See {@link FloorPlan}. */
export const ROOM_STEPS = [
  "Come in through the main entrance on E. Cloverhurst Ave.",
  "Skip the stairs — dining is on floors 2 and 3, and we stay on 1.",
  "Head into the first-floor classroom hallway: Room 124 has the DevDogs sign on the door.",
];

/**
 * Schematic, not measured. The first floor really does split into a classroom
 * wing and a health & well-being wing with dining upstairs (that comes from the
 * architects' program), but the corridor shape and where 124 falls along it are
 * sketched. If the room ever moves or the wing flips, redraw here and reword
 * ROOM_STEPS together: the numbered chips on the route are steps 1–3 of that
 * list.
 */
export default function FloorPlan() {
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
