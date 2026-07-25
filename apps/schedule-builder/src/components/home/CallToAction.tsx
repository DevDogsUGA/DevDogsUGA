import Link from "next/link";
import React from "react";

export function CallToAction() {
  return (
    <div className="flex">
      {/* Left side label */}
      <div className="OuterRingAnimation relative left-8 flex items-center rounded-full bg-pink-50 px-6 py-2">
        <span className="w-32 p-2 text-left text-stone-500 md:w-40">
          Ready?
        </span>
      </div>

      {/* Right side button */}
      <Link
        href="/manual-entry"
        className="OuterRingAnimation trasition relative right-8 flex items-center rounded-full bg-red-700 px-6 py-2 text-white duration-300 ease-in-out hover:bg-[#8b0923]"
      >
        <span className="mr-2 w-24 text-left font-bold md:w-40 md:p-2">
          Get Started
        </span>
        <div className="relative rounded-full bg-white p-2 md:right-10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4 text-orange-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      </Link>
    </div>
  );
}
