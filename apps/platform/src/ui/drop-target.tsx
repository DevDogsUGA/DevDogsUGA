// Dashed "marching ants" placeholder shown in place of a list item while it's
// being dragged elsewhere — shared by drag-and-drop lists (profile links, roles)
// so the dragging affordance stays visually consistent across the console.
export default function DropTarget({
  className = "h-17 max-w-lg",
}: {
  className?: string;
}) {
  return (
    <div className={`relative rounded-sm bg-mauve-800/50 ${className}`}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="calc(100% - 2px)"
          height="calc(100% - 2px)"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="animate-march-dashes text-mauve-600"
        />
      </svg>
    </div>
  );
}
