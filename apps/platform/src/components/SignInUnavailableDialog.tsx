"use client";

import Link from "next/link";
import { ArrowUpRightIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import { INVOLVEMENT_NETWORK_URL } from "~/config/nav";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";

interface Props {
  /** The trigger, rendered in place of the dialog's own button. */
  children: React.ReactNode;
}

/**
 * Stands in for the sign-in flow while it is still being built. Wraps whatever
 * trigger it is given, so a "Sign In" button opens this instead of starting an
 * OAuth handshake the Platform cannot yet finish, and points the visitor at the
 * Involvement Network listing, the way to join DevDogs today.
 */
export default function SignInUnavailableDialog({ children }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-w-md overflow-hidden border-mauve-700 bg-mauve-900 shadow-xl shadow-black/40">
        {/* accent blobs, matching the navbar's other dialogs */}
        <span className="pointer-events-none absolute -top-10 -left-6 h-32 w-32 rounded-full bg-cyan-400/20 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-8 left-1/3 h-24 w-24 rounded-full bg-amber-400/10 blur-3xl" />

        <DialogHeader className="relative">
          <span className="text-2xl text-cyan-400">
            <WrenchIcon />
          </span>
          <DialogTitle className="text-lg font-semibold text-white">
            The Platform is under construction
          </DialogTitle>
          <DialogDescription className="text-sm text-mauve-400">
            Member accounts aren&rsquo;t ready yet — signing in is still being
            built. In the meantime, join us on the{" "}
            <span className="text-mauve-300">UGA Involvement Network</span> and
            you&rsquo;ll be first in line when accounts open up.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose className="rounded-sm border border-mauve-700 px-4 py-2 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white">
            Not now
          </DialogClose>
          <Link
            href={INVOLVEMENT_NETWORK_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-lift hover:shadow-block-sm flex items-center justify-center gap-2 rounded-sm border border-black bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-amber-400"
          >
            Join DevDogs
            <ArrowUpRightIcon />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
