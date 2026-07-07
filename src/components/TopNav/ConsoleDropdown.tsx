"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import * as icons from "~/config/icons";
import type { ConsoleItem } from "~/config/nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";

export default function ConsoleDropdown({ items }: { items: ConsoleItem[] }) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden items-center gap-1 rounded-sm px-2.5 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white data-[state=open]:bg-mauve-800 data-[state=open]:text-white md:flex">
        Console
        <CaretDownIcon className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        {items.map((item) => {
          const Icon = icons[item.icon];
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
