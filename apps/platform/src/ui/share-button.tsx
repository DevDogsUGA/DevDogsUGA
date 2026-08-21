"use client";

import { useCallback, type MouseEvent } from "react";
import { ShareNetworkIcon } from "@phosphor-icons/react/ssr";
import type { ShareTarget } from "~/lib/share";
import { useShare } from "~/lib/useShare";

interface Props extends ShareTarget {
  /** What the label calls the thing being shared, e.g. "DogDays". */
  label: string;
  className?: string;
}

/**
 * Hands a link to the share sheet, or to the clipboard where there is none.
 *
 * Sits beside a link rather than inside it: a button nested in an anchor is
 * invalid, and the rows that use this cover themselves with a stretched link
 * this has to sit on top of.
 */
export default function ShareButton({ title, url, label, className }: Props) {
  const share = useShare({ title, url });

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // The stretched link underneath would otherwise take the press.
      event.preventDefault();
      event.stopPropagation();
      share();
    },
    [share],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Share ${label}`}
      className={className}
    >
      <ShareNetworkIcon />
    </button>
  );
}
