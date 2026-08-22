"use client";

import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";
import { FIND_US_BLURB, FIND_US_TITLE } from "./copy";

interface Props {
  /** Omit both to let the dialog own its state (the homepage trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /** The body below the title — normally {@link FindUsContent}. */
  children: ReactNode;
}

/** The directions dialog's frame: overlay, panel, title, blurb. */
export default function FindUsDialog({
  open,
  onOpenChange,
  trigger,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85dvh] w-full overflow-y-auto rounded-sm border-2 border-black bg-white p-5 text-black ring-0 sm:max-w-xl">
        <div className="flex flex-col gap-2">
          <DialogTitle className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold text-black">
            <MapPinIcon className="text-mauve-500" weight="fill" />
            {FIND_US_TITLE}
          </DialogTitle>
          <DialogDescription className="text-sm text-mauve-600">
            {FIND_US_BLURB}
          </DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
