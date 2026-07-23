"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import devdog from "~/assets/devdog.png";
import * as icons from "~/config/icons";
import {
  SOCIAL_LINKS,
  SWITCHER_LINKS,
  SWITCHER_PRIMARY,
  SWITCHER_PROJECTS,
} from "~/config/nav";
import LinkButton from "~/ui/link-button";
import EntryButton from "./EntryButton";
import { useAppSwitcher } from "./provider";

/**
 * Fullscreen linktree-style overlay listing DevDogs projects, external
 * listings, and social channels. Expands from the trigger's position using
 * the shared menu-expand/menu-collapse keyframes.
 */
export default function AppSwitcher() {
  const { visible, closing, origin, close } = useAppSwitcher();

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More from DevDogs"
      className="fixed inset-0 z-100 flex flex-col overflow-y-auto bg-black"
      style={
        {
          "--menu-origin": origin,
          animation: closing
            ? "menu-collapse 0.38s cubic-bezier(0.4,0,0.2,1) forwards"
            : "menu-expand 0.38s cubic-bezier(0.4,0,0.2,1) forwards",
        } as React.CSSProperties
      }
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          onClick={close}
          className="flex items-center gap-2 lg:gap-2.5"
        >
          <figure className="size-7 shrink-0">
            <Image alt="" src={devdog} />
          </figure>
          <span className="font-display text-lg font-semibold text-white">
            DevDogs
          </span>
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="Close app switcher"
          className="flex size-10 items-center justify-center rounded-sm text-xl text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white"
        >
          <XIcon />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-4 py-8">
        <div className="flex w-full flex-col items-center gap-6">
          <p className="animate-wave cursor-default text-5xl">👋</p>
          <p className="text-center text-white">
            <span className="inline-block">
              Hey, we&rsquo;re DevDogs, a club at UGA building
            </span>{" "}
            <span className="inline-block">
              software with an impact. Join us below!
            </span>
          </p>
        </div>

        <LinkButton
          href={SWITCHER_PRIMARY.href}
          className="hover:shadow-block-md flex items-center justify-center gap-5 rounded-sm border border-black bg-cyan-400 px-12 py-3 text-xl font-extrabold tracking-wide text-black shadow-none transition-[translate,box-shadow] hover:-translate-x-1 hover:-translate-y-1"
        >
          {SWITCHER_PRIMARY.label} <ArrowRightIcon />
        </LinkButton>

        <div className="flex w-full flex-col gap-3">
          <p className="text-center text-xs font-semibold tracking-wide text-mauve-500 uppercase">
            Projects
          </p>
          {SWITCHER_PROJECTS.map((entry) => (
            <EntryButton key={entry.href} entry={entry} />
          ))}

          <p className="pt-3 text-center text-xs font-semibold tracking-wide text-mauve-500 uppercase">
            Links
          </p>
          {SWITCHER_LINKS.map((entry) => (
            <EntryButton key={entry.href} entry={entry} />
          ))}
        </div>

        <div className="flex justify-center gap-8 text-2xl text-mauve-500">
          {SOCIAL_LINKS.map((social) => {
            const Icon = social.icon ? icons[social.icon] : null;
            return (
              <Link
                key={social.href}
                href={social.href}
                target="_blank"
                aria-label={social.label}
                className="transition-[scale,color] hover:scale-120 hover:text-white"
              >
                {Icon && <Icon />}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
