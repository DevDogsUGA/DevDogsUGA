"use client";

import Image, { type StaticImageData } from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ListIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import "~/components/Docs/docs.css";
import apple from "~/assets/os/apple.svg";
import linux from "~/assets/os/linux.svg";
import windows from "~/assets/os/windows.svg";
import { DOCS_BASE } from "~/lib/docsSlug";
import type { DocsSidebarTree } from "~/lib/docsTree";
import DocsProjectMark from "~/components/DocsProjectMark";
import Select from "~/components/Select";
import type { DocsSwitcherEntry } from "~/server/docs/menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import {
  setDocsVariant,
  useDocsVariant,
} from "~/components/DocsVariants/store";
import Tree from "./Tree";

/**
 * The logo and one-line blurb for each platform value the setup pages offer.
 * Keyed by the same `platform.value` the tabs and this select share; a value
 * absent here (there shouldn't be one, `platforms` comes from the same fixed
 * set) falls back to the plain label-only row.
 *
 * The OSes' own logos, in their own colors (the svg-logos set, CC0), not
 * glyphs on a tile: an OS is not one of our apps. WSL is Linux inside
 * Windows, so it is Tux on the Windows logo.
 */
const PLATFORM_MARKS: Record<
  string,
  { logo: StaticImageData; badge?: StaticImageData; description: string }
> = {
  macos: { logo: apple, description: "Apple silicon or Intel" },
  linux: { logo: linux, description: "Ubuntu, Fedora, Arch and others" },
  wsl: {
    logo: windows,
    badge: linux,
    description: "Linux tools inside Windows",
  },
  windows: { logo: windows, description: "PowerShell, without WSL" },
};

function PlatformLogo({
  logo,
  badge,
}: {
  logo: StaticImageData;
  badge?: StaticImageData;
}) {
  return (
    <span aria-hidden className="relative flex size-6 shrink-0">
      <Image
        alt=""
        src={logo}
        sizes="24px"
        className={`object-contain ${badge ? "size-5" : "size-6"}`}
      />
      {badge && (
        <Image
          alt=""
          src={badge}
          sizes="16px"
          className="absolute -right-0.5 -bottom-0.5 size-3.5 object-contain"
        />
      )}
    </span>
  );
}

export interface DocsSidebarProps {
  projects: DocsSwitcherEntry[];
  project: string;
  /** The platforms this project's setup pages cover, in display order. */
  platforms: { value: string; label: string }[];
  tree: DocsSidebarTree;
  /** `/docs`, or the preview's prefix. */
  base?: string;
}

function SidebarContent({
  projects,
  project,
  platforms,
  tree,
  base = DOCS_BASE,
}: DocsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const activePath = useMemo(
    () =>
      pathname
        .split("/")
        .filter(Boolean)
        .slice(base.split("/").filter(Boolean).length + 1) // drop the base and the project segment
        .map(decodeURIComponent)
        .join("/"),
    [pathname, base],
  );

  const offeredOs = useMemo(
    () => platforms.map((platform) => platform.value),
    [platforms],
  );
  const os = useDocsVariant("os", offeredOs);

  function onProjectChange(slug: string) {
    router.push(`${base}/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="docs-side">
      {projects.length > 1 && (
        // The site's own select (`.input.select`), with each project's mark.
        <Select
          value={project}
          onValueChange={onProjectChange}
          aria-label="Project"
          className="w-full"
        >
          {/* One line under each name, never wrapped: at this width a
              sentence turned six choices into a wall. Names and marks are the
              ones the navbar menus use (`getDocsSwitcher`): a Project's own,
              or a docs section's. */}
          {projects.map((p) => (
            <Select.Item
              key={p.slug}
              value={p.slug}
              icon={<DocsProjectMark mark={p.mark} />}
              description={p.description ?? p.name}
            >
              {p.name}
            </Select.Item>
          ))}
        </Select>
      )}

      {/* The same choice as every platform tab strip on the pages: picking
          here switches them all, and picking a tab moves this. Empty until
          hydration rather than guessing, since the server cannot know the
          reader's platform. */}
      <Select
        value={os ?? undefined}
        onValueChange={(value) => setDocsVariant("os", value)}
        aria-label="Your platform"
        placeholder="Your platform"
        className="w-full"
      >
        {platforms.map((platform) => {
          const mark = PLATFORM_MARKS[platform.value];
          return (
            <Select.Item
              key={platform.value}
              value={platform.value}
              icon={
                mark && <PlatformLogo logo={mark.logo} badge={mark.badge} />
              }
              description={mark?.description}
            >
              {platform.label}
            </Select.Item>
          );
        })}
      </Select>

      <Tree tree={tree} ctx={{ project, activePath, base }} />
    </div>
  );
}

export default function DocsSidebar(props: DocsSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile sheet when navigation completes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Phones: the contents open as a sheet from the left */}
      <div className="docs-navbar-m">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <ListIcon weight="bold" />
              Contents
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Documentation</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <SidebarContent {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: sticky aside */}
      <aside className="docs-nav" aria-label="Documentation">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
