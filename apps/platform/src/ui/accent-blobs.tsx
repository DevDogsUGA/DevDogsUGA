const ACCENT_BLOB_COLORS = {
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
} as const;

export type AccentColor = keyof typeof ACCENT_BLOB_COLORS;

interface Props {
  accent: AccentColor;
}

export default function AccentBlobs({ accent }: Props) {
  const color = ACCENT_BLOB_COLORS[accent];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className={`absolute -top-24 -left-24 size-96 rounded-full ${color} opacity-[0.12] blur-3xl`}
      />
      <div
        className={`absolute top-1/3 -right-32 size-112 rounded-full ${color} opacity-[0.10] blur-3xl`}
      />
      <div
        className={`absolute bottom-0 left-1/4 size-80 rounded-full ${color} opacity-[0.11] blur-3xl`}
      />
    </div>
  );
}
