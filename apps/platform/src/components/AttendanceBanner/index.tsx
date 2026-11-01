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
import { buttonVariants } from "~/ui/button";
import { dismiss, isDismissed, subscribeToDismissal } from "./dismissal";

const HIDDEN_PREFIXES = ["/settings", "/dashboard", "/oauth", "/tools"];

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
    <AttendanceBannerView
      meetingId={meetingId}
      title={title}
      onDismiss={() => dismiss(meetingId)}
    />
  );
}

/** The strip itself, apart from the fetch and the dismissal store, for the kit gallery. */
export function AttendanceBannerView({
  meetingId,
  title,
  onDismiss,
}: {
  meetingId: string;
  title: string;
  onDismiss: () => void;
}) {
  return (
    <aside
      aria-label="Meeting attendance"
      data-slot="attendance-banner"
      className="wrap py-3"
    >
      {/* The kit's `.alert.ok`: a framed strip, centred in the page column. */}
      <div className="alert ok items-center">
        <CheckCircleIcon
          weight="fill"
          className="size-6 shrink-0 text-[var(--ok)]"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Check in now</p>
          <p className="truncate">
            <b>{title}</b>
          </p>
        </div>
        <Link
          href={`/dashboard/attendance?meeting=${meetingId}`}
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Attendance <ArrowRightIcon />
        </Link>
        <button
          type="button"
          aria-label="Dismiss attendance reminder"
          onClick={onDismiss}
          className="iconbtn"
        >
          <XIcon weight="bold" />
        </button>
      </div>
    </aside>
  );
}
