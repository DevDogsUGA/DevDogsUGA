"use client";

import { useVerification } from "~/components/TopNav/NavUserProvider";
import VerificationChecklist from "~/components/VerificationChecklist";

/**
 * The verification checklist on the accounts page, read from the same context
 * the navbar's dialog uses, so the two cannot disagree about what is done.
 */
export default function VerificationStatusField() {
  const ctx = useVerification();
  if (!ctx) return null;

  return (
    <VerificationChecklist
      verificationStatus={ctx.verificationStatus}
      isVerified={ctx.isVerified}
      involvementFullName={ctx.involvementFullName}
      showPublicProfile={false}
    />
  );
}
