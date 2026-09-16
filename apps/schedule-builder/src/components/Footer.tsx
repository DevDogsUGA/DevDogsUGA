import {
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
} from "@phosphor-icons/react/ssr";
import { DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";

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
    <footer className="border-t border-edge bg-surface px-4 py-6 text-sm text-muted">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
        >
          <DogDaysMark size={22} color="currentColor" />
          <span className="font-display text-base leading-none font-semibold tracking-tight">
            DogDays
          </span>
          <span className="mt-px text-xs text-muted">by UGA DevDogs</span>
        </Link>

        <nav className="flex items-center gap-5">
          <a
            className="transition-colors hover:text-foreground"
            href="https://devdogs.uga.edu/"
            target="_blank"
            rel="noopener"
          >
            About Us
          </a>
          <a
            className="transition-colors hover:text-foreground"
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
                className="rounded-md p-1.5 text-xl transition-colors hover:bg-surface-muted hover:text-foreground"
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
