"use client";

import { useCallback } from "react";
import { shareOrCopy, type ShareTarget } from "./share";
import { toast } from "./toast";

/**
 * Shares a link, and speaks up only when the device had no sheet to show.
 *
 * The single place the wording lives, since a tile can reach this two ways —
 * the button a pointer reveals, and the long press a finger uses.
 */
export function useShare({ title, url }: ShareTarget) {
  return useCallback(() => {
    void shareOrCopy({ title, url }).then((outcome) => {
      if (outcome === "copied") toast.success("Link copied");
      if (outcome === "failed") toast.error("Couldn't share that link");
      // "shared" and "dismissed" both already showed the person a sheet.
    });
  }, [title, url]);
}
