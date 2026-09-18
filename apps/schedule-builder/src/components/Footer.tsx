import {
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DogDaysIcon } from "~/components/DogDaysIcon";

const SOCIALS = [
  {
    title: "GitHub",
    href: "https://github.com/DevDogsUGA",
    Icon: GithubLogoIcon,
  },
  {
    title: "Instagram",
    href: "https://www.instagram.com/devdogsuga/",
    Icon: InstagramLogoIcon,
  },
  {
    title: "LinkedIn",
    href: "https://www.linkedin.com/company/devdogsuga/",
    Icon: LinkedinLogoIcon,
  },
] as const;

export function Footer() {
  return (
    <footer className="bg-navy px-4 py-6 text-sm text-zinc-400">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Link
          href="/"
          className="font-display text-navy-foreground text-base font-semibold tracking-tight whitespace-nowrap transition-opacity hover:opacity-80"
        >
          <DogDaysIcon className="mr-1.5 inline-block h-[0.799em] w-auto align-baseline" />
          DogDays{" "}
          <span className="font-sans text-xs text-zinc-400">by DevDogs</span>
        </Link>

        <nav className="flex items-center gap-5">
          <a
            className="hover:text-navy-foreground transition-colors"
            href="https://devdogs.uga.edu/"
            target="_blank"
            rel="noopener"
          >
            About Us
          </a>
          <a
            className="hover:text-navy-foreground transition-colors"
            href="https://linktr.ee/devdogs"
            target="_blank"
            rel="noopener"
          >
            Contact
          </a>
          <span className="flex items-center gap-1">
            {SOCIALS.map(({ title, href, Icon }) => (
              <a
                key={title}
                title={title}
                href={href}
                target="_blank"
                rel="noopener"
                className="hover:text-navy-foreground rounded-md p-1.5 text-xl transition-colors hover:bg-white/10"
              >
                <Icon weight="bold" />
              </a>
            ))}
          </span>
        </nav>
      </div>
    </footer>
  );
}
