import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { APPS } from "@devdogsuga/og";
import Link from "next/link";
import { DogDaysIcon } from "~/components/DogDaysIcon";
import { Navbar } from "~/components/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center md:px-6">
        {/* The same baseline lockup as the navbar, writ large: the mark rides
            in the text run with its body at Alan Sans cap height. */}
        <h2 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          <DogDaysIcon className="text-accent mr-[0.35em] inline-block h-[0.79em] w-auto align-baseline" />
          DogDays
        </h2>
        <p className="text-accent text-lg font-medium sm:text-xl">
          The UGA schedule builder — for students, by students.
        </p>
        <p className="text-muted max-w-xl text-balance">{APPS.dogdays.blurb}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/plans/create"
            className="bg-primary hover:bg-primary-strong flex items-center gap-2 rounded-lg px-6 py-3 text-lg font-semibold text-white shadow-sm transition-colors"
          >
            Start Now <ArrowRightIcon weight="bold" />
          </Link>
          <Link
            href="/courses"
            className="border-edge-strong bg-surface hover:bg-surface-muted rounded-lg border px-6 py-3 text-lg font-medium transition-colors"
          >
            Browse Courses
          </Link>
        </div>
      </div>
    </>
  );
}
