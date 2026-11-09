import Link from "next/link";

/**
 * The presenter view's `forbidden()`. The baseline answered a caller without
 * attendance access with its 404; this keeps today's 403 status and prints the
 * 404 page's layout, on the presenter ground.
 */
export default function PresentForbidden() {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-4 overflow-auto px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-rose-300">403</h1>
      <p className="max-w-prose text-sm text-mauve-400">
        Your roles don&rsquo;t include the permission this display needs.
      </p>
      <Link
        href="/"
        className="text-sm text-mauve-400 underline-offset-4 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
      >
        Back to the homepage
      </Link>
    </div>
  );
}
