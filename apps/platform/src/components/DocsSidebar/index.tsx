"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SidebarIcon } from "@phosphor-icons/react/ssr";
import type { DocsTreeNode } from "~/lib/docsTree";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import Tree from "./Tree";

export interface DocsSidebarProps {
  projects: { slug: string; name: string }[];
  project: string;
  tree: DocsTreeNode[];
}

function SidebarContent({ projects, project, tree }: DocsSidebarProps) {
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

  function onProjectChange(slug: string) {
    router.push(`/docs/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {projects.length > 1 && (
        <Select value={project} onValueChange={onProjectChange}>
          <SelectTrigger aria-label="Project" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Tree nodes={tree} ctx={{ project, activePath }} />
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
