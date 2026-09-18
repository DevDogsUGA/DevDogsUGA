"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { APPS } from "@devdogsuga/og";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DogDaysIcon } from "~/components/DogDaysIcon";
import { Navbar } from "~/components/Navbar";
import { useSession } from "~/components/providers/SessionProvider";
import signIn from "~/lib/signIn";

const ORGS = [
  {
    name: "UGA DevDogs",
    href: "https://devdogs.uga.edu/",
    light: "/brand/devdogs-logo.svg",
    dark: "/brand/devdogs-logo-dark.svg",
    width: 112,
    height: 30,
    heightClass: "h-8",
  },
  {
    name: "Google Developer Groups on Campus at UGA",
    href: "https://gdg.community.dev/gdg-on-campus-university-of-georgia-athens-united-states/",
    light: "/brand/gdgc-uga-lockup.svg",
    dark: "/brand/gdgc-uga-lockup-dark.svg",
    width: 236,
    height: 31,
    heightClass: "h-6",
  },
] as const;

export default function Home() {
  const { user } = useSession();
  const router = useRouter();

  return (
    <>
      <Navbar />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center md:px-6">
        {/* The same baseline lockup as the navbar, writ large: the mark rides
            in the text run with its body at Alan Sans cap height. */}
        <h2 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          <DogDaysIcon className="text-accent mr-[0.35em] inline-block h-[0.799em] w-auto align-baseline" />
          DogDays
        </h2>
        <p className="text-accent text-lg font-medium sm:text-xl">
          The UGA schedule builder, built by students, for students.
        </p>
        <p className="text-muted max-w-xl text-balance">{APPS.dogdays.blurb}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() =>
              user ? router.push("/plans/create") : void signIn()
            }
            className="bg-primary hover:bg-primary-strong flex items-center gap-2 rounded-lg px-6 py-3 text-lg font-semibold text-white shadow-sm transition-colors"
          >
            Start Now <ArrowRightIcon weight="bold" />
          </button>
          <Link
            href="/courses"
            className="border-edge-strong bg-surface hover:bg-surface-muted rounded-lg border px-6 py-3 text-lg font-medium transition-colors"
          >
            Browse Courses
          </Link>
        </div>

        <div className="flex flex-col items-center gap-5 pt-14">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            A project of
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {ORGS.map((org) => (
              <a
                key={org.name}
                href={org.href}
                target="_blank"
                rel="noopener"
                title={org.name}
                className="transition-opacity hover:opacity-75"
              >
                <Image
                  src={org.light}
                  alt={org.name}
                  width={org.width}
                  height={org.height}
                  className={`${org.heightClass} w-auto dark:hidden`}
                />
                <Image
                  src={org.dark}
                  alt={org.name}
                  width={org.width}
                  height={org.height}
                  className={`${org.heightClass} hidden w-auto dark:block`}
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
