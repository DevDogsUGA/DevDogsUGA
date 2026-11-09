"use client";

import {
  ArrowUpRightIcon,
  CalendarPlusIcon,
  CaretDownIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/classic/ui/dropdown-menu";
import { ACTION_DARK_CLS } from "./meetingView";

const ITEM_CLS =
  "cursor-pointer px-2.5 py-2 text-mauve-100 focus:bg-white/10 focus:text-white";

export default function AddToCalendar({
  googleUrl,
  outlookUrl,
  icsUrl,
}: {
  googleUrl: string;
  outlookUrl: string;
  icsUrl: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={ACTION_DARK_CLS}>
          <CalendarPlusIcon /> Add to Calendar <CaretDownIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[60] w-52 border border-mauve-600 bg-mauve-800 text-white"
      >
        <DropdownMenuItem asChild className={ITEM_CLS}>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            Google Calendar <ArrowUpRightIcon className="ml-auto" />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM_CLS}>
          <a href={outlookUrl} target="_blank" rel="noopener noreferrer">
            Outlook <ArrowUpRightIcon className="ml-auto" />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM_CLS}>
          <a href={icsUrl} download>
            Other (Download ICS) <DownloadSimpleIcon className="ml-auto" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
