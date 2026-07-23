"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Image from "next/image";
import { ArrowRightIcon, CalendarDotsIcon } from "@phosphor-icons/react/ssr";
import backendDiscussion from "~/assets/BackendDiscussion.jpg";
import Hypno from "./Hypno";
import LinkButton from "~/ui/link-button";
import SectionBackground, {
  buildSectionPath,
  type BlobDef,
} from "~/ui/section-background";

const useSafeLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const GEM_CLIP =
  "polygon(14.803% 1.369%,14.803% 1.369%,15.09% 1.006%,15.406% 0.699%,15.746% 0.448%,16.105% 0.255%,16.478% 0.121%,16.861% 0.047%,17.25% 0.035%,17.64% 0.086%,18.026% 0.201%,18.403% 0.381%,27.394% 5.541%,27.394% 5.541%,27.7% 5.693%,28.014% 5.801%,28.332% 5.867%,28.653% 5.89%,28.972% 5.87%,29.289% 5.809%,29.6% 5.706%,29.902% 5.562%,30.193% 5.377%,30.471% 5.152%,35.322% 0.738%,35.322% 0.738%,35.641% 0.483%,35.976% 0.282%,36.325% 0.135%,36.681% 0.041%,37.043% 0.001%,37.406% 0.016%,37.766% 0.085%,38.12% 0.208%,38.463% 0.386%,38.793% 0.619%,50.521% 10.126%,50.521% 10.126%,50.673% 10.242%,50.829% 10.346%,50.989% 10.438%,51.153% 10.519%,51.32% 10.587%,51.489% 10.644%,51.661% 10.688%,51.835% 10.719%,52.01% 10.739%,52.187% 10.745%,75.257% 10.745%,75.257% 10.745%,75.421% 10.75%,75.583% 10.767%,75.744% 10.794%,75.903% 10.832%,76.061% 10.88%,76.216% 10.939%,76.369% 11.008%,76.519% 11.087%,76.667% 11.177%,76.81% 11.276%,98.013% 26.894%,98.013% 26.894%,98.388% 27.218%,98.716% 27.6%,98.995% 28.031%,99.223% 28.503%,99.398% 29.01%,99.517% 29.542%,99.578% 30.093%,99.579% 30.654%,99.518% 31.217%,99.392% 31.775%,94.622% 48.404%,94.622% 48.404%,94.557% 48.656%,94.505% 48.913%,94.466% 49.172%,94.441% 49.433%,94.429% 49.695%,94.431% 49.958%,94.446% 50.221%,94.474% 50.482%,94.516% 50.741%,94.571% 50.997%,99.718% 72.141%,99.718% 72.141%,99.805% 72.589%,99.852% 73.04%,99.859% 73.491%,99.826% 73.937%,99.756% 74.375%,99.648% 74.8%,99.504% 75.209%,99.324% 75.596%,99.109% 75.958%,98.861% 76.29%,80.131% 98.632%,80.131% 98.632%,79.878% 98.903%,79.608% 99.137%,79.322% 99.331%,79.024% 99.485%,78.716% 99.599%,78.4% 99.672%,78.08% 99.703%,77.757% 99.692%,77.434% 99.637%,77.114% 99.537%,52.664% 90.168%,52.664% 90.168%,52.399% 90.083%,52.132% 90.027%,51.864% 90.002%,51.595% 90.007%,51.329% 90.041%,51.066% 90.105%,50.807% 90.197%,50.555% 90.318%,50.311% 90.467%,50.075% 90.644%,39.363% 99.549%,39.363% 99.549%,39.209% 99.669%,39.05% 99.777%,38.888% 99.873%,38.721% 99.957%,38.551% 100.028%,38.378% 100.087%,38.203% 100.133%,38.026% 100.166%,37.847% 100.186%,37.667% 100.192%,17.827% 100.192%,17.827% 100.192%,17.544% 100.176%,17.265% 100.127%,16.993% 100.046%,16.728% 99.935%,16.472% 99.795%,16.227% 99.625%,15.994% 99.428%,15.775% 99.204%,15.572% 98.955%,15.385% 98.68%,0.683% 74.983%,0.683% 74.983%,0.46% 74.576%,0.281% 74.143%,0.146% 73.69%,0.054% 73.223%,0.007% 72.746%,0.004% 72.266%,0.046% 71.787%,0.133% 71.315%,0.265% 70.855%,0.443% 70.413%,9.333% 51.283%,9.333% 51.283%,9.463% 50.974%,9.57% 50.653%,9.656% 50.324%,9.718% 49.988%,9.758% 49.646%,9.775% 49.302%,9.769% 48.956%,9.74% 48.611%,9.687% 48.269%,9.611% 47.932%,2.728% 21.763%,2.728% 21.763%,2.638% 21.347%,2.583% 20.926%,2.563% 20.503%,2.578% 20.082%,2.627% 19.667%,2.709% 19.26%,2.824% 18.865%,2.972% 18.487%,3.151% 18.127%,3.361% 17.791%)";

const HERO_BLOBS: BlobDef[] = [
  { cx: "78%", cy: "22%", rx: "42%", ry: "55%", fill: "#083344", opacity: 0.9 }, // teal
  {
    cx: "18%",
    cy: "72%",
    rx: "50%",
    ry: "42%",
    fill: "#4c0519",
    opacity: 0.85,
  }, // crimson
  {
    cx: "52%",
    cy: "48%",
    rx: "38%",
    ry: "38%",
    fill: "#083344",
    opacity: 0.55,
  }, // teal
  {
    cx: "30%",
    cy: "15%",
    rx: "38%",
    ry: "32%",
    fill: "#4c0519",
    opacity: 0.65,
  }, // crimson
  { cx: "68%", cy: "88%", rx: "44%", ry: "30%", fill: "#083344", opacity: 0.6 }, // teal
];

const GEM_BORDER_SHADOW = {
  filter: [
    "drop-shadow(2px 0 0 #e11d48)",
    "drop-shadow(-2px 0 0 #e11d48)",
    "drop-shadow(0 2px 0 #e11d48)",
    "drop-shadow(0 -2px 0 #e11d48)",
    "drop-shadow(20px 20px 0 #fbbf24)",
  ].join(" "),
};

function HeroPhotoFrame() {
  return (
    <div className="w-full shrink-0 overflow-hidden md:w-1/2 md:max-w-xl md:overflow-visible">
      <div style={GEM_BORDER_SHADOW}>
        <div className="relative aspect-4/3" style={{ clipPath: GEM_CLIP }}>
          <Image
            fill
            alt="DevDogs team planning session"
            src={backendDiscussion}
            className="object-cover object-center"
          />
        </div>
      </div>
    </div>
  );
}

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useSafeLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    function update() {
      const W = section!.clientWidth;
      const H = section!.clientHeight;
      const angle = window.innerWidth >= 768 ? 4 : 2;
      const S = Math.tan((angle * Math.PI) / 180) * W;
      section!.style.clipPath = `path('${buildSectionPath(W, H, S, "flat", "bs")}')`;
    }

    const ro = new ResizeObserver(update);
    ro.observe(section);
    update();
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        ref={sectionRef}
        className="relative flex min-h-[65vh] items-center overflow-hidden pb-(--section-skew-slope)"
      >
        <SectionBackground
          topEdge="flat"
          bottomEdge="bs"
          base="rgba(15,10,30,0.78)"
          blobs={HERO_BLOBS}
          blurSd={55}
        />
        <Hypno />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 md:py-24">
          <div className="flex flex-col items-center gap-10 md:flex-row md:items-center md:gap-12">
            <div className="flex flex-1 flex-col items-start gap-8">
              <h1
                className="font-display text-5xl/none font-extrabold text-white sm:text-6xl/none lg:text-7xl/none"
                style={{ filter: "drop-shadow(4px 4px 0 #e11d48)" }}
              >
                BUILD REAL
                <br />
                SOFTWARE.
                <br />
                EVERY WEEK.
              </h1>
              <p className="max-w-md text-lg text-balance text-mauve-300">
                DevDogs runs weekly workshops and hackathons where UGA students
                apply real skills and ship features for community projects.
              </p>
              <div className="flex flex-wrap gap-3">
                <LinkButton
                  href="/join"
                  className="transition-lift hover:shadow-block-md flex items-center gap-2 rounded-sm border border-black bg-cyan-400 px-6 py-2.5 font-bold text-black shadow-none hover:-translate-x-1 hover:-translate-y-1 hover:shadow-amber-400"
                >
                  Join DevDogs
                  <ArrowRightIcon />
                </LinkButton>
                <LinkButton
                  href="#events"
                  className="hover:shadow-block-md flex items-center gap-2 rounded-sm border border-mauve-300 bg-mauve-100 px-6 py-2.5 font-semibold text-mauve-700 shadow-none shadow-mauve-500 transition-[translate,box-shadow,border-color] hover:-translate-x-1 hover:-translate-y-1 hover:border-black"
                >
                  See Events
                  <CalendarDotsIcon />
                </LinkButton>
              </div>
            </div>
            <HeroPhotoFrame />
          </div>
        </div>
      </section>
    </div>
  );
}
