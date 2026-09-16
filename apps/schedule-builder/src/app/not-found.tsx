import { DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <DogDaysMark size={64} color="currentColor" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        Page Not Found
      </h1>
      <p className="max-w-md text-balance text-muted">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-6 py-2.5 font-semibold text-white transition-colors hover:bg-primary-strong"
      >
        Back Home
      </Link>
    </div>
  );
}
