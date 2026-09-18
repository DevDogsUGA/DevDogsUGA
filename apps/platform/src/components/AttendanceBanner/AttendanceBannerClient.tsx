"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

const HIDDEN_PREFIXES = [
  "/account",
  "/attendance",
  "/console",
  "/oauth",
  "/teams",
  "/tools",
  "/vote",
];

export default function AttendanceBannerClient({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const pathname = usePathname();
  const storageKey = `devdogs:attendance-banner:${meetingId}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setDismissed(sessionStorage.getItem(storageKey) === "dismissed");
      } catch {
        // Storage is optional; leave this meeting's reminder visible.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  const hiddenRoute = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (dismissed || hiddenRoute) return null;

  return (
    <aside
      aria-label="Meeting attendance"
      className="fixed bottom-44 left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border-2 border-black bg-cyan-300 px-4 py-3 text-black shadow-[6px_6px_0_#0891b2] md:bottom-28 md:left-6"
    >
      <CheckCircleIcon weight="fill" className="size-6 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wider uppercase">
          Check in now
        </p>
        <p className="max-w-56 truncate text-sm font-semibold">{title}</p>
      </div>
      <Link
        href={`/attendance?meeting=${meetingId}`}
        className="flex shrink-0 items-center gap-1 rounded-sm border-2 border-black bg-black px-3 py-1.5 text-sm font-semibold text-white"
      >
        Attendance <ArrowRightIcon className="size-4" />
      </Link>
      <button
        type="button"
        aria-label="Dismiss attendance reminder"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(storageKey, "dismissed");
          } catch {
            // It may reappear after navigation when storage is unavailable.
          }
        }}
        className="rounded p-1 hover:bg-black/10 focus-visible:outline-2"
      >
        <XIcon className="size-4" />
      </button>
    </aside>
  );
}
