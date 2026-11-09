import Link from "next/link";
export default function NotFoundPage() {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 @sm:px-6">
      <h1 className="font-display text-3xl font-bold text-rose-300">404</h1>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Link
          href="/"
          className="text-sm text-mauve-400 underline-offset-4 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          Back to the homepage
        </Link>
      </div>
    </div>
  );
}
