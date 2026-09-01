import {
  CalendarDotsIcon,
  CompassIcon,
  DiamondIcon,
  HeartIcon,
  LightningIcon,
  RocketIcon,
  StarIcon,
} from "@phosphor-icons/react/ssr";
import HeroSection from "~/components/HeroSection";
import SectionMarquee, { MarqueeItem } from "~/components/SectionMarquee";
import MissionSection, { MISSION_BLOBS } from "~/components/MissionSection";
import ProjectsSection, { PROJECTS_BLOBS } from "~/components/ProjectsSection";
import EventsSection, { EVENTS_BLOBS } from "~/components/EventsSection";
import PartnersSection from "~/components/PartnersSection";
import LeadershipSection from "~/components/LeadershipSection";
import StatCard from "~/ui/stat-card";
import JsonLd, { siteGraph } from "~/lib/structuredData";

const MARQUEE_TEXT_CLS =
  "py-4 font-display text-base font-bold tracking-widest uppercase";

export default function HomePage() {
  return (
    <>
      {/* The Organization and WebSite nodes, on the homepage and nowhere else.
          Both describe the site rather than this page, so repeating them on
          every route would be the same two claims made 28 times over, and a
          crawler that finds several copies of a node has to pick one. The apex
          is where a search engine looks for them.

          It sits out here rather than inside {@link HomeSections} because it
          describes the site rather than the cached page sections themselves. */}
      <JsonLd data={siteGraph()} />
      <HomeSections />
    </>
  );
}

/**
 * `"use cache"` is what puts the homepage in the prerendered shell. Under Cache
 * Components everything is dynamic by default, so without it the static output
 * was the nav chrome and nothing else, 7.9 KB of shell, and every visit
 * re-rendered the whole marketing page on the server. Every section here is
 * static copy or reads the cached calendar frame, so caching is accurate.
 */
async function HomeSections() {
  "use cache";

  return (
    <main className="flex flex-col gap-4 bg-black py-4 md:gap-6 md:py-6">
      <HeroSection />

      <SectionMarquee
        slope="bs"
        duration={50}
        copyZBase={10}
        hoverInvert
        keepHoveredInView
        aria-label="Homepage sections"
      >
        {/* In the order the sections themselves run, and each card in its own
            section's hue. The fill is the 400 its blobs are drawn from, so a
            card is a piece of the place it opens rather than a differently
            coloured door onto it. `zIndexClass` stays with the *slot*, not the
            card: it descends left to right for the hover lift alone. */}
        <StatCard
          description="Learn By Doing"
          title="Mission"
          cta="Read the Mission"
          icon={CompassIcon}
          textColor="text-rose-950"
          bg="bg-rose-400"
          darkBg="bg-rose-600"
          blobs={MISSION_BLOBS}
          href="#mission"
          zIndexClass="z-30"
        />
        <StatCard
          description="Real Applications"
          title="Projects"
          cta="Browse Projects"
          icon={RocketIcon}
          textColor="text-amber-950"
          bg="bg-amber-400"
          darkBg="bg-amber-600"
          blobs={PROJECTS_BLOBS}
          href="#projects"
          zIndexClass="z-20"
        />
        <StatCard
          description="Weekly Workshops"
          title="Events"
          cta="See the Schedule"
          icon={CalendarDotsIcon}
          textColor="text-cyan-950"
          bg="bg-cyan-400"
          darkBg="bg-cyan-600"
          blobs={EVENTS_BLOBS}
          href="#events"
          zIndexClass="z-10"
        />
      </SectionMarquee>

      <MissionSection topEdge="bs" bottomEdge="fs" />

      <SectionMarquee
        slope="fs"
        bg="bg-rose-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-rose-100 shadow-rose-900`}
        icon={HeartIcon}
      >
        <MarqueeItem>Learn By Doing</MarqueeItem>
        <MarqueeItem>Apply Real Skills</MarqueeItem>
        <MarqueeItem>Software That Matters</MarqueeItem>
        <MarqueeItem>SWE @ UGA</MarqueeItem>
        <MarqueeItem>Industry-Standard Tech</MarqueeItem>
        <MarqueeItem>A Place For You</MarqueeItem>
        <MarqueeItem>Community Impact</MarqueeItem>
      </SectionMarquee>

      <ProjectsSection topEdge="fs" bottomEdge="bs" />

      <SectionMarquee
        slope="bs"
        bg="bg-amber-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-amber-100 shadow-amber-900`}
        icon={LightningIcon}
      >
        <MarqueeItem>By Students, For Students</MarqueeItem>
        <MarqueeItem>New Features Every Week</MarqueeItem>
        <MarqueeItem>Shipped Every Semester</MarqueeItem>
        <MarqueeItem>Real Projects for Real Users</MarqueeItem>
        <MarqueeItem>Design, Frontend, Backend</MarqueeItem>
        <MarqueeItem>100% Free and Open Source</MarqueeItem>
      </SectionMarquee>

      <EventsSection topEdge="bs" bottomEdge="bs" />

      <SectionMarquee
        slope="bs"
        bg="bg-cyan-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-cyan-100 shadow-cyan-900`}
        icon={StarIcon}
      >
        <MarqueeItem>One Feature, Every Week</MarqueeItem>
        <MarqueeItem>Every Team at Once</MarqueeItem>
        <MarqueeItem>Weekly Workshops</MarqueeItem>
        <MarqueeItem>Ship a Pull Request</MarqueeItem>
        <MarqueeItem>Build Sessions</MarqueeItem>
        <MarqueeItem>Show off to Your Friends</MarqueeItem>
        <MarqueeItem>Vote for the Best</MarqueeItem>
      </SectionMarquee>

      <PartnersSection topEdge="bs" bottomEdge="fs" />

      <SectionMarquee
        slope="fs"
        bg="bg-purple-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-purple-100 shadow-purple-900`}
        icon={DiamondIcon}
      >
        <MarqueeItem>Software Engineers</MarqueeItem>
        <MarqueeItem>UI Designers</MarqueeItem>
        <MarqueeItem>UX Researchers</MarqueeItem>
        <MarqueeItem>Software Engineers</MarqueeItem>
        <MarqueeItem>Data Scientists</MarqueeItem>
        <MarqueeItem>Project Leaders</MarqueeItem>
        <MarqueeItem>Community Builders</MarqueeItem>
      </SectionMarquee>

      <LeadershipSection topEdge="fs" bottomEdge="flat" />
    </main>
  );
}
