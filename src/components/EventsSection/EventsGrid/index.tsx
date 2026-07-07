"use client";

import { useState } from "react";
import Image from "next/image";
import type { StaticImageData } from "next/image";
import bruceAlmighty from "~/assets/bruce-almighty.gif";
import charlieConspiracy from "~/assets/charlie-conspiracy.gif";
import informationGif from "~/assets/information.gif";
import jobApplication from "~/assets/job-application.gif";
import staticGif from "~/assets/static.gif";
import EventCard from "./EventCard";
import MonthCalendar from "./MonthCalendar";
import type { CalendarEvent, EventType } from "~/app/(navbar)/homeData";
import { parseISO } from "date-fns";

const gifMap: Record<EventType | "default", StaticImageData> = {
  default: staticGif,
  hackathon: charlieConspiracy,
  workshop: informationGif,
  devhours: bruceAlmighty,
  career: jobApplication,
};

const EVENT_TYPES: EventType[] = [
  "hackathon",
  "workshop",
  "devhours",
  "career",
];

function nextOrLatest(
  events: CalendarEvent[],
  type: EventType,
): CalendarEvent | undefined {
  const ofType = events.filter((e) => e.type === type);
  const now = new Date();
  const upcoming = ofType.filter((e) => parseISO(e.start) >= now);
  return upcoming[0] ?? ofType[ofType.length - 1];
}

interface Props {
  events: CalendarEvent[];
}

export default function EventsGrid({ events }: Props) {
  const [hoveredEventType, setHoveredEventType] = useState<EventType | null>(
    null,
  );
  const currentGif = gifMap[hoveredEventType ?? "default"];

  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:grid-rows-2"
      data-animate-stagger
    >
      <div
        className="row-span-full flex flex-col gap-[inherit] lg:col-span-2"
        data-animate="fade-up"
      >
        <MonthCalendar events={events} onEventTypeHover={setHoveredEventType} />
        <div
          className="shadow-block-md relative grow overflow-hidden rounded-sm border-2 border-black"
          data-animate="fade-up"
        >
          <Image
            alt=""
            className="absolute inset-0 size-full object-cover"
            src={staticGif}
          />
          {hoveredEventType && (
            <Image
              key={hoveredEventType}
              alt=""
              className="absolute inset-0 size-full object-cover"
              src={currentGif}
            />
          )}
        </div>
      </div>

      <div className="col-span-3 row-span-2 grid grid-cols-2 grid-rows-subgrid gap-1">
        {EVENT_TYPES.map((type) => {
          const event = nextOrLatest(events, type);
          if (!event) return null;
          return (
            <div className="aspect-square" key={type} data-animate="fade-up">
              <EventCard
                event={event}
                isHighlighted={hoveredEventType === type}
                onMouseEnter={() => setHoveredEventType(type)}
                onMouseLeave={() => setHoveredEventType(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
