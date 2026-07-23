interface Props {
  value: number;
  max: number;
  fillColor?: "amber" | "sky";
  className?: string;
}

export default function ProgressBar({
  value,
  max,
  fillColor = "amber",
  className = "",
}: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = fillColor === "sky" ? "bg-sky-400" : "bg-amber-400";
  return (
    <div
      className={`relative h-1.5 w-full overflow-hidden rounded-full bg-mauve-700 ${className}`}
    >
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
