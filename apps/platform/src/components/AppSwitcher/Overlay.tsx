"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useNavUser } from "~/components/TopNav/NavUserProvider";
import SignInButton from "~/components/TopNav/SignInButton";
import * as icons from "~/config/icons";
import { SOCIAL_LINKS, SWITCHER_LINKS, SWITCHER_PRIMARY } from "~/config/nav";
import type { SwitcherProject } from "~/server/projects/showcase";
import LinkButton from "~/ui/link-button";
import EntryButton from "./EntryButton";
import ProjectTile from "./ProjectTile";
import "./switcher.css";
import { useAppSwitcher } from "./provider";

/**
 * Fullscreen linktree-style overlay: the DevDogs pitch, the projects as app
 * icons, external listings, and social channels. Expands from the trigger's
 * position using the shared menu-expand/menu-collapse keyframes.
 *
 * The client half of the switcher. `AppSwitcher` (the folder's index) reads the
 * projects on the server and hands them down, so the list is data and the
 * overlay stays the component that opens and closes.
 */
export default function Overlay({ projects }: { projects: SwitcherProject[] }) {
  const { visible, closing, origin, close } = useAppSwitcher();
  const navUser = useNavUser();

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More from DevDogs"
      className="switcher fixed inset-0 z-100 flex flex-col overflow-y-auto"
      style={
        {
          "--menu-origin": origin,
          animation: closing
            ? "menu-collapse 0.38s cubic-bezier(0.4,0,0.2,1) forwards"
            : "menu-expand 0.38s cubic-bezier(0.4,0,0.2,1) forwards",
        } as React.CSSProperties
      }
    >
      <div className="topnav shrink-0 justify-between">
        <Link href="/" onClick={close} aria-label="DevDogs home">
          <Image
            className="logo"
            alt=""
            src="/cosmic/a/devdogs-logo-dark.png"
            width={104}
            height={28}
            unoptimized
          />
        </Link>
        {/* Mirrors the navbar's trailing cluster so the close button lands
            exactly where the grid trigger was. */}
        <div className="flex items-center gap-3">
          {/* The overlay only mounts on a click, well after the streamed user
              cluster has hydrated the context, so a signed-in visitor never
              sees this flash before `navUser` arrives. Hidden at 900px and
              below, where the navbar has already folded into the drawer and
              the overlay's Join CTA is the pitch instead of signing in. */}
          {!navUser && (
            <div className="max-[900px]:hidden">
              <SignInButton />
            </div>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close app switcher"
            className="btn ghost icon sm"
          >
            <XIcon weight="bold" />
          </button>
        </div>
      </div>

      {/* Sized to fit one screen: the gaps tighten, and from lg the links and
          apps share a row instead of stacking. */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-3 sm:gap-10 lg:max-w-5xl lg:gap-12">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
          <p className="animate-wave cursor-default text-4xl">👋</p>
          <p className="text-center">
            <span className="inline-block">
              Hey, we&rsquo;re DevDogs, a club at UGA building
            </span>{" "}
            <span className="inline-block">
              software with an impact. Join us below!
            </span>
          </p>

          <LinkButton
            href={SWITCHER_PRIMARY.href}
            // /join redirects off-site, not a page, so never prefetch.
            prefetch={false}
            variant="default"
            size="lg"
            className="w-full"
          >
            {SWITCHER_PRIMARY.label} <ArrowRightIcon />
          </LinkButton>
        </div>

        <div className="grid w-full gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
          {/* Links lead because their featured rows are time-sensitive. Move
            them back below Apps once no row is featured. */}
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 lg:max-w-none">
            <p className="switcher-cap mb-2">Links</p>
            {SWITCHER_LINKS.map((entry) => (
              <EntryButton key={entry.href} entry={entry} />
            ))}
          </div>

          {/* Apps take the left column on desktop; on phones the links
              still lead, for their time-sensitive rows. */}
          <div className="flex w-full flex-col gap-3 lg:order-first">
            <p className="switcher-cap mb-2">Apps</p>
            {/* No recessed treatment here, unlike the homepage grid: every tile
              is the same size, and the ones with nowhere to send you render
              disabled, which says more than a size difference would. */}
            {/* Always two up. The row gap clears the badges riding each
                tile's top edge; both section labels carry the same bottom
                margin, so the first badge clears its label and, side by
                side, the tiles' top rims line up with the first link's. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {projects.map((project) => (
                <ProjectTile
                  key={project.id}
                  project={project}
                  onNavigate={close}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 text-2xl">
          {SOCIAL_LINKS.map((social) => {
            const Icon = social.icon ? icons[social.icon] : null;
            return (
              <Link
                key={social.href}
                href={social.href}
                target="_blank"
                aria-label={social.label}
                className="iconbtn"
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
