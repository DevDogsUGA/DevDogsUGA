export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="w-full animate-pulse rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-4 shadow-lg shadow-black/30">
      <div className="py-2">
        <div className="h-3 w-24 rounded bg-mauve-800" />
      </div>
      <div className="divide-y divide-mauve-800">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 py-6">
            <div className="h-4 w-32 rounded bg-mauve-800" />
            <div className="h-3 w-64 rounded bg-mauve-800/60" />
            <div className="mt-2 h-9 w-full rounded-md bg-mauve-800/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full animate-pulse rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-4 shadow-lg shadow-black/30">
      <div className="flex gap-4 border-b border-mauve-800 py-3">
        <div className="h-3 w-20 rounded bg-mauve-800" />
        <div className="h-3 w-32 rounded bg-mauve-800" />
        <div className="h-3 w-24 rounded bg-mauve-800" />
        <div className="flex-1" />
        <div className="h-3 w-16 rounded bg-mauve-800" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-mauve-800/50 py-4">
          <div className="h-3 w-20 rounded bg-mauve-800/60" />
          <div className="h-3 w-40 rounded bg-mauve-800/40" />
          <div className="h-3 w-24 rounded bg-mauve-800/40" />
          <div className="flex-1" />
          <div className="h-3 w-16 rounded bg-mauve-800/30" />
        </div>
      ))}
    </div>
  );
}
