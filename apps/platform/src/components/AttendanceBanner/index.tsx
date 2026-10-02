"use client";

import { useQuery } from "@tanstack/react-query";
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

export const ONGOING_MEETING_QUERY_KEY = ["attendance", "ongoing"] as const;

type OngoingMeetingResponse = {
  meeting: { id: string; title: string } | null;
};

async function fetchOngoingMeeting(): Promise<OngoingMeetingResponse> {
  const response = await fetch("/attendance/ongoing", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`GET /attendance/ongoing failed: ${response.status}`);
  }
  return (await response.json()) as OngoingMeetingResponse;
}

/**
 * The "Check in now" strip. Site pages are cached HTML, so this renders
 * nothing on the server and in the first client render, then asks
 * `/attendance/ongoing` after hydration. It paints only once it has a meeting
 * and has checked, synchronously, that this session hasn't dismissed it, so
 * there is no flash to hide and no pre-paint script.
 */
export default function AttendanceBanner() {
  const pathname = usePathname();
  const hiddenRoute = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const { data } = useQuery({
    queryKey: ONGOING_MEETING_QUERY_KEY,
    queryFn: fetchOngoingMeeting,
    enabled: !hiddenRoute,
    staleTime: 30_000,
    // A meeting that starts while the tab is open shows up without a reload.
    refetchInterval: 60_000,
  });
  const meeting = data?.meeting ?? null;
  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    () => (meeting ? isDismissed(meeting.id) : false),
    () => true,
  );
  if (!meeting || dismissed || hiddenRoute) return null;
  const meetingId = meeting.id;
  const { title } = meeting;

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
