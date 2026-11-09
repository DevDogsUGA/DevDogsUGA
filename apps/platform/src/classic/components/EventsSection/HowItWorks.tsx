"use client";
import { useState } from "react";
import { cn } from "~/lib/cn";
import CrtTv from "./CrtTv";
import informationGif from "~/assets/information.gif";
import bruceAlmighty from "~/assets/bruce-almighty.gif";
const beats = [
  {
    day: "Monday",
    title: "Workshop",
    body: "Every workshop is self-contained, and none assumes you were here last week.",
    image: informationGif,
  },
  {
    day: "Wednesday",
    title: "Build Session",
    body: "Catch up on workshop materials, meet up with friends for hackathons, get unblocked with support from focus leads and club officers, or just come hang out and get work done!",
    image: bruceAlmighty,
  },
];
export default function HowItWorks({
  id,
  tone = "light",
}: {
  id: string;
  cutout?: boolean;
  tone?: "light" | "dark";
}) {
  const [active, setActive] = useState<number | null>(null);
  const beat = active === null ? null : beats[active];
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="space-y-8">
      <div className="flex items-start justify-between gap-8">
        <div className="flex max-w-prose flex-col gap-4 text-left font-medium text-mauve-800">
          <h2
            id={`${id}-heading`}
            className={cn(
              "font-display text-2xl font-extrabold md:text-3xl",
              tone === "dark" ? "text-white" : "text-black",
            )}
          >
            Weekly Programming
          </h2>
          <p
            className={cn(
              "text-base/relaxed text-balance",
              tone === "dark" ? "text-mauve-300" : "text-mauve-700",
            )}
          >
            Every DevDogs project grows one merged feature at a time, with a new
            feature for each project every week.
          </p>
        </div>
        <CrtTv
          className="hidden w-64 lg:block"
          channel={
            active === null ? null : active === 0 ? "monday" : "wednesday"
          }
          showing={beat ? { key: beat.title, image: beat.image } : null}
        />
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {beats.map((beat, i) => (
          <li
            key={beat.title}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="drop-shadow-block-md flex flex-col gap-2 rounded-sm border-2 border-black bg-white p-4 text-black"
          >
            <p className="font-display text-xs font-extrabold tracking-widest text-mauve-600 uppercase">
              {beat.day}
            </p>
            <h3 className="font-display text-lg leading-tight font-extrabold">
              {beat.title}
            </h3>
            <p className="text-sm/relaxed text-mauve-700">{beat.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
