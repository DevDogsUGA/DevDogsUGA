import { ArrowUpRightIcon, ClockIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import type { CalendarEvent, EventType } from "~/app/(site)/homeData";
import { formatEventTime } from "~/app/(site)/homeData";

const eventBadge: Record<
  EventType,
  { bg: string; text: string; label: string }
> = {
  hackathon: { bg: "bg-cyan-400", text: "text-black", label: "Hackathon" },
  workshop: { bg: "bg-amber-400", text: "text-black", label: "Workshop" },
  devhours: { bg: "bg-mauve-800", text: "text-white", label: "Dev Hours" },
  career: { bg: "bg-emerald-800", text: "text-white", label: "Career" },
};

interface Props {
  event: CalendarEvent;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function EventCard({
  event,
  isHighlighted = false,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const badge = eventBadge[event.type];
  return (
    <div
      className={`shadow-block-lg flex h-full flex-col gap-3 rounded-sm border-2 border-black bg-white p-5 transition-[opacity,scale] hover:scale-100 hover:opacity-100 ${isHighlighted ? "scale-100 opacity-100" : "scale-90 opacity-75"}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        className={`${badge.bg} ${badge.text} w-fit rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase`}
      >
        {badge.label}
      </span>
      <h3 className="font-display text-lg leading-tight font-extrabold text-black">
        {event.title}
      </h3>
      <p className="flex-1 text-sm/relaxed text-mauve-600">
        {event.description}
      </p>
      <div className="flex flex-col gap-1 border-t border-mauve-200 pt-3 text-xs text-mauve-500">
        <span className="flex items-center gap-1.5">
          <ClockIcon className="shrink-0" />
          {formatEventTime(event.start, event.end)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPinIcon className="shrink-0" />
          {event.location}
        </span>
        {event.rsvpUrl && (
          <a
            href={event.rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-semibold text-black hover:underline"
          >
            RSVP <ArrowUpRightIcon />
          </a>
        )}
      </div>
    </div>
  );
}
