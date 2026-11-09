"use client";

import { SealCheckIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/classic/components/FormButton";
import { useVerification } from "~/classic/components/TopNav/NavUserProvider";

export default function VerificationStatusField() {
  const ctx = useVerification();
  if (!ctx) return null;

  const { isVerified, verificationStatus, involvementFullName } = ctx;
  const openDialog = () => ctx.setDialogOpen(true);

  // The same steps the checklist dialog counts.
  const joined = involvementFullName !== null;
  const steps = [
    joined,
    ...(joined ? [verificationStatus.nameMatchesInvolvement] : []),
    verificationStatus.hasPronouns,
    verificationStatus.hasGraduationDate,
    verificationStatus.hasGithub,
    verificationStatus.hasDiscord,
  ];
  const total = steps.length;
  const completed = steps.filter(Boolean).length;

  if (isVerified) {
    return (
      <div className="flex flex-col gap-3">
        <div className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-emerald-950 px-2.5 py-1 text-sm font-medium text-emerald-300">
          <SealCheckIcon className="shrink-0" />
          Verified
        </div>
        <FormButton
          type="button"
          theme="black"
          className="w-fit text-sm"
          onClick={openDialog}
        >
          View Checklist
        </FormButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-rose-950 px-2.5 py-1 text-sm font-medium text-rose-300">
        <ShieldWarningIcon className="shrink-0" />
        {completed}/{total} Complete
      </div>
      <FormButton
        type="button"
        theme="cyan"
        className="w-fit text-sm"
        onClick={openDialog}
      >
        Finish Account Setup
      </FormButton>
    </div>
  );
}
