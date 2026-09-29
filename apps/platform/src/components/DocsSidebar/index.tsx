"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AppleLogoIcon,
  LinuxLogoIcon,
  SidebarIcon,
  WindowsLogoIcon,
} from "@phosphor-icons/react/ssr";
import { DOCS_PROJECT_LABELS } from "~/config/docs";
import type { DocsSidebarTree } from "~/lib/docsTree";
import DocsProjectMark, { Mark } from "~/components/DocsProjectMark";
import Select from "~/components/Select";
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
 * The mark and one-line blurb for each platform value the setup pages offer.
 * Keyed by the same `platform.value` the tabs and this select share; a value
 * absent here (there shouldn't be one, `platforms` comes from the same fixed
 * set) falls back to the plain label-only row.
 */
const PLATFORM_MARKS: Record<
  string,
  {
    icon: ComponentType<{ className?: string; weight?: "bold" }>;
    description: string;
  }
> = {
  macos: { icon: AppleLogoIcon, description: "Apple silicon or Intel" },
  linux: {
    icon: LinuxLogoIcon,
    description: "Ubuntu, Fedora, Arch and others",
  },
  wsl: { icon: WindowsLogoIcon, description: "Linux tools inside Windows" },
  windows: { icon: WindowsLogoIcon, description: "PowerShell, without WSL" },
};

export interface DocsSidebarProps {
  projects: { slug: string; name: string; description: string | null }[];
  project: string;
  /** The platforms this project's setup pages cover, in display order. */
  platforms: { value: string; label: string }[];
  tree: DocsSidebarTree;
}

function SidebarContent({
  projects,
  project,
  platforms,
  tree,
}: DocsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const activePath = useMemo(
    () =>
      pathname
        .split("/")
        .filter(Boolean)
        .slice(2) // drop "docs" and the project segment
        .map(decodeURIComponent)
        .join("/"),
    [pathname],
  );

  const offeredOs = useMemo(
    () => platforms.map((platform) => platform.value),
    [platforms],
  );
  const os = useDocsVariant("os", offeredOs);

  function onProjectChange(slug: string) {
    router.push(`/docs/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {projects.length > 1 && (
        // The site's own select, the same control the account page's
        // graduation fields use, rather than the shadcn one in ~/ui, which is
        // styled for a light surface and left the chosen project's name
        // painted in <body>'s text-mauve-950 against the dark sidebar.
        <Select
          value={project}
          onValueChange={onProjectChange}
          aria-label="Project"
          className="w-full"
        >
          {/* One line under each name, never wrapped: at this width a
              sentence turned six choices into a wall. Brands and taglines
              come from DOCS_PROJECT_LABELS. */}
          {projects.map((p) => {
            const label = DOCS_PROJECT_LABELS[p.slug];
            return (
              <Select.Item
                key={p.slug}
                value={p.slug}
                icon={<DocsProjectMark slug={p.slug} />}
                description={label?.tagline ?? p.description ?? p.name}
              >
                {label?.name ?? p.name}
              </Select.Item>
            );
          })}
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
                mark && (
                  <Mark icon={mark.icon} iconBg="bg-mauve-300" size="sm" />
                )
              }
              description={mark?.description}
            >
              {platform.label}
            </Select.Item>
          );
        })}
      </Select>

      <Tree tree={tree} ctx={{ project, activePath }} />
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
      {/* Mobile: disclosure bar under the navbar */}
      <div className="sticky top-16 z-40 border-b border-mauve-800 bg-mauve-950/90 px-4 py-2 backdrop-blur lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white">
            <SidebarIcon className="size-4" />
            Browse docs
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-80 overflow-y-auto border-mauve-800 bg-mauve-950 p-4"
          >
            <SheetHeader className="p-0 pb-3">
              <SheetTitle className="text-left text-sm text-mauve-400">
                Documentation
              </SheetTitle>
            </SheetHeader>
            <SidebarContent {...props} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: sticky aside */}
      <aside className="sticky top-16 hidden h-[calc(100vh-var(--spacing)*16)] w-72 shrink-0 overflow-y-auto border-r border-mauve-800 p-4 lg:block">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
