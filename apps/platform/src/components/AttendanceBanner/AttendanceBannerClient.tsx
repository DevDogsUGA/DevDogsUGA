"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { dismiss, isDismissed, subscribeToDismissal } from "./dismissal";

const HIDDEN_PREFIXES = [
  "/account",
  "/attendance",
  "/console",
  "/oauth",
  "/teams",
  "/tools",
];

export default function AttendanceBannerClient({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const pathname = usePathname();
  // The server snapshot is "not dismissed" so hydration matches the HTML; the
  // pre-paint script in index.tsx has already hidden the strip by CSS when the
  // session dismissed it, so the client snapshot only removes it from the DOM.
  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    () => isDismissed(meetingId),
    () => false,
  );
  const hiddenRoute = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (dismissed || hiddenRoute) return null;

  return (
    <aside
      aria-label="Meeting attendance"
      data-slot="attendance-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-black bg-cyan-300 px-4 py-2 text-black md:px-6"
    >
      <CheckCircleIcon weight="fill" className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wider uppercase">
          Check in now
        </p>
        <p className="truncate text-sm font-semibold">{title}</p>
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
        onClick={() => dismiss(meetingId)}
        className="rounded p-1 hover:bg-black/10 focus-visible:outline-2"
      >
        <XIcon className="size-4" />
      </button>
    </aside>
  );
}
