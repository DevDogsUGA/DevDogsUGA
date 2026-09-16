import {
  ArrowRightIcon,
  CalendarDotsIcon,
  ChalkboardTeacherIcon,
  SparkleIcon,
} from "@phosphor-icons/react/ssr";
import { APPS, DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";
import { Navbar } from "~/components/Navbar";

const FEATURES = [
  {
    Icon: ChalkboardTeacherIcon,
    title: "Live registrar data",
    body: "Course and section info scraped straight from UGA's registrar, kept current all semester.",
  },
  {
    Icon: SparkleIcon,
    title: "Conflict-free schedules",
    body: "Pick your courses and preferences; DogDays generates every schedule that actually works.",
  },
  {
    Icon: CalendarDotsIcon,
    title: "Compare and save plans",
    body: "Keep the candidates side by side, pin your favorite, and tweak until it feels right.",
  },
] as const;

export default function Home() {
  return (
    <>
      <Navbar />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-14 px-4 py-16 text-center md:px-6">
        <div className="flex flex-col items-center gap-6">
          <span className="text-accent">
            <DogDaysMark size={80} color="currentColor" />
          </span>
          <h2 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            DogDays
          </h2>
          <p className="text-lg font-medium text-accent sm:text-xl">
            The UGA schedule builder — for students, by students.
          </p>
          <p className="max-w-xl text-balance text-muted">
            {APPS.dogdays.blurb}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/plans/create"
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
            >
              Start Now <ArrowRightIcon weight="bold" />
            </Link>
            <Link
              href="/courses"
              className="rounded-lg border border-edge-strong bg-surface px-6 py-3 text-lg font-medium transition-colors hover:bg-surface-muted"
            >
              Browse Courses
            </Link>
          </div>
        </div>

        <ul className="grid w-full gap-4 text-left sm:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <li
              key={title}
              className="flex flex-col gap-2 rounded-xl border border-edge bg-surface p-5"
            >
              <Icon weight="duotone" className="text-3xl text-accent" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
