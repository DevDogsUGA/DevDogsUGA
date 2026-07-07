"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DotsNineIcon, ListIcon } from "@phosphor-icons/react/ssr";
import { AppSwitcherTrigger } from "~/components/AppSwitcher/provider";
import * as icons from "~/config/icons";
import {
  PUBLIC_LINKS,
  SOCIAL_LINKS,
  type ConsoleItem,
  type NavItem,
} from "~/config/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";

interface Props {
  consoleItems: ConsoleItem[];
  profileItems: NavItem[];
  signedIn: boolean;
}

function SheetSection({
  title,
  items,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {title && (
        <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
          {title}
        </p>
      )}
      {items.map((item) => {
        const Icon = icons[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm font-medium text-mauve-200 transition-colors hover:bg-mauve-800 hover:text-white"
          >
            <Icon className="size-4.5 shrink-0 text-mauve-400" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function MobileSheet({
  consoleItems,
  profileItems,
  signedIn,
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close when navigation completes (covers back/forward too).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white md:hidden"
      >
        <ListIcon className="size-5" />
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-72 flex-col gap-5 overflow-y-auto border-mauve-800 bg-mauve-950 p-4"
      >
        <SheetHeader className="p-0">
          <SheetTitle className="text-left text-sm text-mauve-400">
            Menu
          </SheetTitle>
        </SheetHeader>

        <SheetSection items={PUBLIC_LINKS} onNavigate={close} />

        {consoleItems.length > 0 && (
          <SheetSection title="Console" items={consoleItems} onNavigate={close} />
        )}

        {signedIn && (
          <SheetSection title="You" items={profileItems} onNavigate={close} />
        )}

        <AppSwitcherTrigger>
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-sm font-medium text-mauve-200 transition-colors hover:bg-mauve-800 hover:text-white"
          >
            <DotsNineIcon weight="bold" className="size-4.5 shrink-0 text-mauve-400" />
            More from DevDogs
          </button>
        </AppSwitcherTrigger>

        <div className="mt-auto flex gap-2 border-t border-mauve-800 pt-4">
          {SOCIAL_LINKS.map((social) => {
            const Icon = social.icon ? icons[social.icon] : null;
            return (
              <Link
                key={social.href}
                href={social.href}
                target="_blank"
                aria-label={social.label}
                className="rounded-sm border border-mauve-700 p-1.5 text-lg text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white"
              >
                {Icon && <Icon />}
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
