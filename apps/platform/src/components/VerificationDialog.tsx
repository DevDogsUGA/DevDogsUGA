"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import { useVerification } from "~/components/TopNav/NavUserProvider";
import VerificationChecklist from "~/components/VerificationChecklist";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VerificationDialog({ open, onOpenChange }: Props) {
  const ctx = useVerification();
  if (!ctx) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md overflow-hidden border-mauve-700 bg-mauve-900 shadow-xl shadow-black/40"
        showCloseButton={false}
      >
        {/* rose gradient blobs */}
        <span className="pointer-events-none absolute -top-10 -left-6 h-32 w-32 rounded-full bg-rose-400/20 blur-3xl" />
        <span className="pointer-events-none absolute top-1/3 -right-8 h-28 w-28 rounded-full bg-rose-500/15 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-8 left-1/3 h-24 w-24 rounded-full bg-rose-300/10 blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">
              Welcome back!
            </DialogTitle>
            <DialogDescription className="text-sm text-mauve-400">
              Your profile is still a work in progress. Complete the steps below
              to appear on the{" "}
              <span className="text-mauve-300">DevDogs community page</span> and
              unlock full access to club tools and resources.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            className="mt-0.5 shrink-0 rounded-sm p-1 text-mauve-400 transition-colors hover:text-white"
            aria-label="Close"
          >
            <XIcon />
          </DialogClose>
        </div>

        <div className="relative">
          <VerificationChecklist
            userId={ctx.userId}
            verificationStatus={ctx.verificationStatus}
            isVerified={ctx.isVerified}
            involvementFullName={ctx.involvementFullName}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
