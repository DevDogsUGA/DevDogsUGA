import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import LinkButton from "~/ui/link-button";
import SectionBackground, { type BlobDef } from "~/ui/section-background";

const BLOBS: BlobDef[] = [
  { cx: "78%", cy: "22%", rx: "42%", ry: "55%", fill: "#083344", opacity: 0.9 },
  {
    cx: "18%",
    cy: "72%",
    rx: "50%",
    ry: "42%",
    fill: "#4c0519",
    opacity: 0.85,
  },
  {
    cx: "52%",
    cy: "48%",
    rx: "38%",
    ry: "38%",
    fill: "#083344",
    opacity: 0.55,
  },
  {
    cx: "30%",
    cy: "15%",
    rx: "38%",
    ry: "32%",
    fill: "#4c0519",
    opacity: 0.65,
  },
  { cx: "68%", cy: "88%", rx: "44%", ry: "30%", fill: "#083344", opacity: 0.6 },
];

export default function UnderConstruction() {
  return (
    <main className="flex grow flex-col bg-black py-4 md:py-6">
      <div className="mx-4 flex grow flex-col overflow-hidden rounded-xl md:mx-6">
        <section className="relative flex grow items-center justify-center overflow-hidden">
          <SectionBackground
            topEdge="flat"
            bottomEdge="flat"
            base="rgba(15,10,30,0.78)"
            blobs={BLOBS}
            blurSd={55}
          />
          <div className="relative z-10 flex flex-col items-center gap-8 px-6 py-24 text-center">
            <h1
              className="font-display text-5xl/none font-extrabold text-white sm:text-6xl/none lg:text-7xl/none"
              style={{ filter: "drop-shadow(4px 4px 0 #e11d48)" }}
            >
              UNDER
              <br />
              CONSTRUCTION.
            </h1>
            <p className="max-w-md text-lg text-balance text-mauve-300">
              We&rsquo;re in the process of redesigning our website. This page
              isn&rsquo;t quite ready yet — check back soon!
            </p>
            <LinkButton
              href="/"
              className="transition-lift hover:shadow-block-md flex items-center gap-2 rounded-sm border border-black bg-cyan-400 px-6 py-2.5 font-bold text-black shadow-none hover:-translate-x-1 hover:-translate-y-1 hover:shadow-amber-400"
            >
              Go Home
              <ArrowRightIcon />
            </LinkButton>
          </div>
        </section>
      </div>
    </main>
  );
}
