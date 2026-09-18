import { DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";
import { Navbar } from "~/components/Navbar";

interface ComingSoonProps {
  title: string;
  blurb?: string;
}

/**
 * Shared shell for routes that exist but aren't built yet, so they read as a
 * deliberate part of the app instead of a stray prototype.
 */
export function ComingSoon({ title, blurb }: ComingSoonProps) {
  return (
    <>
      <Navbar />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-24 text-center">
        <span className="text-edge-strong">
          <DogDaysMark size={56} color="currentColor" />
        </span>
        <h1 className="font-display text-4xl font-semibold">{title}</h1>
        <p className="text-muted max-w-md text-balance">
          {blurb ?? "This part of DogDays isn't ready yet — check back soon."}
        </p>
        <Link
          href="/plans"
          className="bg-primary hover:bg-primary-strong rounded-lg px-6 py-2.5 font-semibold text-white transition-colors"
        >
          Go to My Plans
        </Link>
      </div>
    </>
  );
}
