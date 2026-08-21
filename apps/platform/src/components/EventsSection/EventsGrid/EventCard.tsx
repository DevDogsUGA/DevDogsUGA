import { ArrowUpRightIcon, ClockIcon } from "@phosphor-icons/react/ssr";
import type { CalendarEvent } from "~/app/(site)/homeData";
import { formatRecurrence } from "~/app/(site)/homeData";
import { eventBadge } from "./eventBadge";

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
  // A career event is a one-off with no beats, so it gets no footer rule at all
  // rather than an empty one under its description.
  const hasFooter = event.recurring === true || event.steps !== undefined;
  return (
    <div
      className={`shadow-block-lg flex h-full flex-col gap-3 overflow-hidden rounded-sm border-2 border-black bg-white p-5 transition-[opacity,scale] hover:scale-100 hover:opacity-100 ${isHighlighted ? "scale-100 opacity-100" : "lg:scale-90 lg:opacity-75"}`}
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
      {/* `min-h-0` lets this actually shrink: a flex item will not go below its
          content height without it, which is how the description used to push
          the steps straight through the bottom border of the square. */}
      <p className="min-h-0 flex-1 overflow-hidden text-sm/relaxed text-mauve-600">
        {event.description}
      </p>
      {hasFooter && (
        <div className="flex flex-col gap-1.5 border-t border-mauve-200 pt-3 text-xs/snug text-mauve-600">
          {event.recurring && (
            <p className="flex items-center gap-1.5 font-semibold text-black">
              <ClockIcon className="shrink-0 text-mauve-500" />
              {formatRecurrence(event.start, event.end)}
            </p>
          )}
          {event.steps && (
            <ol className="flex flex-col gap-1.5">
              {event.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`${badge.bg} ${badge.text} mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold`}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {event.rsvpUrl && (
        <a
          href={event.rsvpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-black hover:underline"
        >
          RSVP <ArrowUpRightIcon />
        </a>
      )}
    </div>
  );
}
