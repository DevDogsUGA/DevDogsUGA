"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import devdog from "~/assets/devdog.png";
import { useNavUser } from "~/components/TopNav/NavUserProvider";
import SignInButton from "~/components/TopNav/SignInButton";
import * as icons from "~/config/icons";
import { SOCIAL_LINKS, SWITCHER_LINKS, SWITCHER_PRIMARY } from "~/config/nav";
import { SWITCHER_PROJECTS } from "~/config/projects";
import LinkButton from "~/ui/link-button";
import EntryButton from "./EntryButton";
import ProjectTile from "./ProjectTile";
import { useAppSwitcher } from "./provider";

/**
 * Fullscreen linktree-style overlay: the DevDogs pitch, the projects as app
 * icons, external listings, and social channels. Expands from the trigger's
 * position using the shared menu-expand/menu-collapse keyframes.
 */
export default function AppSwitcher() {
  const { visible, closing, origin, close } = useAppSwitcher();
  const navUser = useNavUser();

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
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          onClick={close}
          className="flex items-center gap-2 lg:gap-2.5"
        >
          <figure className="size-7 shrink-0">
            {/* Same `size-7` box as the navbar's, which this header mirrors. */}
            <Image alt="" src={devdog} sizes="28px" />
          </figure>
          <span className="font-display text-lg font-semibold text-white">
            DevDogs
          </span>
        </Link>
        {/* Mirrors the navbar's trailing cluster so the close button lands
            exactly where the grid trigger was: same gap, same size-9 box, same
            size-4.5 bold icon, and the same neighbour to its right — the Sign
            In button, or a spacer the width of the avatar. */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={close}
            aria-label="Close app switcher"
            className="flex size-9 items-center justify-center rounded-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white"
          >
            <XIcon weight="bold" className="size-4.5" />
          </button>
          {/* The overlay only mounts on a click, well after the streamed user
              cluster has hydrated the context — so a signed-in visitor never
              sees this flash before `navUser` arrives. Hidden below md, where
              the navbar has already folded into the drawer: the overlay's Join
              CTA is the pitch there, not signing in. */}
          {navUser ? (
            <span aria-hidden className="hidden w-7.5 md:block" />
          ) : (
            <div className="hidden md:block">
              <SignInButton />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
          <p className="animate-wave cursor-default text-5xl">👋</p>
          <p className="text-center text-white">
            <span className="inline-block">
              Hey, we&rsquo;re DevDogs, a club at UGA building
            </span>{" "}
            <span className="inline-block">
              software with an impact. Join us below!
            </span>
          </p>

          <LinkButton
            href={SWITCHER_PRIMARY.href}
            // /join redirects off-site, not a page — never prefetch.
            prefetch={false}
            // The amber lift the Sign In button in the header uses, a size up:
            // this one moves twice as far, so the shadow grows with it to stay
            // a step ahead of the travel rather than hiding behind the button.
            className="hover:shadow-block-lg flex w-full items-center justify-center gap-5 rounded-sm border border-black bg-cyan-400 px-12 py-3 text-xl font-extrabold tracking-wide text-black shadow-none transition-[translate,box-shadow] hover:-translate-x-1 hover:-translate-y-1 hover:shadow-amber-400"
          >
            {SWITCHER_PRIMARY.label} <ArrowRightIcon />
          </LinkButton>
        </div>

        <div className="flex w-full flex-col gap-3">
          <p className="text-center text-xs font-semibold tracking-wide text-mauve-500 uppercase">
            Projects
          </p>
          {/* No recessed treatment here, unlike the homepage grid: every tile
              is the same size, and the ones with nowhere to send you render
              disabled, which says more than a size difference would. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {SWITCHER_PROJECTS.map((project) => (
              <ProjectTile
                key={project.title}
                project={project}
                onNavigate={close}
              />
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          <p className="text-center text-xs font-semibold tracking-wide text-mauve-500 uppercase">
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
