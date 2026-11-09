"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  RssIcon,
} from "@phosphor-icons/react/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/classic/ui/dialog";

const TRIGGER_CLS =
  "flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white lg:w-auto";

export default function SubscribeToCalendar({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const appUrl = new URL(feedUrl);
  appUrl.protocol = "webcal:";

  async function copyFeedUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied. Selecting the value leaves it ready
      // for the user's ordinary copy command instead of making this a dead end.
      inputRef.current?.select();
    }
  }

  return (
    <Dialog onOpenChange={() => setCopied(false)}>
      <DialogTrigger asChild>
        <button type="button" className={TRIGGER_CLS}>
          Subscribe to Calendar <RssIcon weight="bold" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 p-5 text-white shadow-2xl ring-0 shadow-black/60 sm:max-w-xl"
        overlayClassName="bg-black/40"
      >
        <DialogHeader className="contents">
          <DialogTitle className="font-display flex items-center gap-[1ch] text-2xl leading-tight font-extrabold text-white">
            Subscribe to Calendar
            <RssIcon className="text-mauve-400" weight="bold" />
          </DialogTitle>
          <DialogDescription className="text-sm text-mauve-300">
            Get DevDogs Events directly in your calendar app of choice! Look for
            the &ldquo;Subscribe by URL&rdquo; or &ldquo;Add calendar from
            URL&rdquo; option. Changes and cancellations will update
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-5 grid min-h-0 gap-4 overflow-y-auto px-5">
          <div className="flex items-stretch gap-2">
            <input
              ref={inputRef}
              readOnly
              value={feedUrl}
              aria-label="DevDogs calendar subscription URL"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-mauve-600 bg-mauve-900 px-3 py-2.5 font-mono text-sm text-mauve-200 outline-none focus:border-white"
            />
            <button
              type="button"
              onClick={copyFeedUrl}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-transparent hover:text-white"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="contents">
            <span className="text-mauve-400">or</span>
            <a
              href={appUrl.toString()}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white"
            >
              Open Calendar App <ArrowUpRightIcon />
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
