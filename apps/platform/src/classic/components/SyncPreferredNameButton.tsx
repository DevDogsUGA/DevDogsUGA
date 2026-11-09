"use client";

import {
  SpinnerGapIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react/ssr";
import { useCommand } from "~/classic/ui/use-command";
import { updateIdentity } from "~/server/actions/profile";

interface Props {
  userId: string;
  involvementFullName: string;
}

export default function SyncPreferredNameButton({
  involvementFullName,
}: Props) {
  const { run, pending: isNamePending, result } = useCommand(updateIdentity);
  function handleClick() {
    run({ preferredName: involvementFullName.trim() });
  }

  return (
    <span className="flex flex-col gap-2">
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
      {result && !result.ok && <span role="alert">{result.message}</span>}
    </span>
  );
}
