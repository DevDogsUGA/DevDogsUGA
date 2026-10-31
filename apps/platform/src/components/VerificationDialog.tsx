"use client";

import { useRef } from "react";
import { useVerification } from "~/components/TopNav/NavUserProvider";
import VerificationChecklist from "~/components/VerificationChecklist";
import { DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell from "~/ui/dialog-shell";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VerificationDialog({ open, onOpenChange }: Props) {
  const ctx = useVerification();
  const headingRef = useRef<HTMLHeadingElement>(null);
  if (!ctx) return null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      tone="dark"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        headingRef.current?.focus();
      }}
      header={
        <div className="flex flex-col gap-1 pr-10">
          <DialogTitle
            ref={headingRef}
            tabIndex={-1}
            className="text-xl text-[var(--text)] outline-none md:text-2xl"
          >
            Welcome back!
          </DialogTitle>
          <DialogDescription className="help max-w-lg">
            Your profile is still a work in progress. Complete the steps below
            to verify your account.{" "}
            {ctx.publicProfiles
              ? "Verified members can choose to appear on the DevDogs community page."
              : "Verification confirms you are a current UGA student in the club."}
          </DialogDescription>
        </div>
      }
    >
      <VerificationChecklist
        verificationStatus={ctx.verificationStatus}
        isVerified={ctx.isVerified}
        involvementFullName={ctx.involvementFullName}
        onNavigate={() => onOpenChange(false)}
      />
    </DialogShell>
  );
}
