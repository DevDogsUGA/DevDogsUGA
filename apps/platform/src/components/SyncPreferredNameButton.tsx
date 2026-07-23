"use client";

import { useRouter } from "next/navigation";
import { SpinnerGapIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { useProfileIdentity } from "~/hooks/useProfileIdentity";

interface Props {
  userId: string;
  involvementFullName: string;
}

export default function SyncPreferredNameButton({
  userId,
  involvementFullName,
}: Props) {
  const router = useRouter();
  const { saveName, isNamePending } = useProfileIdentity(
    userId,
    involvementFullName,
  );

  async function handleClick() {
    try {
      await saveName();
      router.refresh();
    } catch {
      // error toast already shown by useProfileIdentity
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isNamePending}
      className="relative flex items-center justify-center gap-[1ch] rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 enabled:hover:bg-transparent enabled:hover:text-white enabled:hover:shadow-sm enabled:hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isNamePending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <SpinnerGapIcon className="animate-spin [animation-duration:750ms]" />
        </span>
      )}
      <span className={isNamePending ? "invisible" : "contents"}>
        <ArrowCounterClockwiseIcon />
        {`Update Name to "${involvementFullName}"`}
      </span>
    </button>
  );
}
