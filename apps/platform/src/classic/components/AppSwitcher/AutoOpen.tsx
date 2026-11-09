"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAppSwitcher } from "./provider";

/**
 * Preserves the printed/link-in-bio entry point: visiting any page with
 * ?utm_content=linkinbio (as on QR codes and social bios) opens the app
 * switcher, recreating the linktree landing experience.
 */
export default function AutoOpen() {
  const { open } = useAppSwitcher();
  const searchParams = useSearchParams();

  const isFromLinkInBio = useMemo(
    () =>
      searchParams
        .getAll("utm_content")
        .some((s) => s.toLowerCase().replaceAll(/[^a-z]/g, "") === "linkinbio"),
    [searchParams],
  );

  useEffect(() => {
    if (isFromLinkInBio) open();
  }, [isFromLinkInBio, open]);

  return null;
}
