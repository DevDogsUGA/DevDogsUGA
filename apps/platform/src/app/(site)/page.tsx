import type { ReactNode } from "react";
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
import ProjectsSection, {
  PROJECTS_BLOBS,
} from "~/components/ProjectsSection";
import EventsSection, { EVENTS_BLOBS } from "~/components/EventsSection";
import PartnersSection from "~/components/PartnersSection";
import LeadershipSection from "~/components/LeadershipSection";
import StatCard from "~/ui/stat-card";
import StreakCTA from "~/components/ProjectsSection/StreakCTA";
import UnderConstruction from "~/components/UnderConstruction";
import JsonLd, { siteGraph } from "~/lib/structuredData";

const MARQUEE_TEXT_CLS =
  "py-4 font-display text-base font-bold tracking-widest uppercase";

/**
 * The page itself stays uncached so it can construct `<StreakCTA />`, the one
 * genuinely per-visitor thing on the homepage. Everything else lives in the
 * cached {@link HomeSections} below.
 *
 * Passing the element down rather than rendering it inside the cached body is
 * the whole trick: an element created out here renders outside the cache
 * boundary, so its `cookies()` read is legal and it streams into the Suspense
 * that ProjectsSection puts around it. Rendering it inside would fail the build
 * with "used `cookies()` inside \"use cache\"".
 */
export default function HomePage() {
  return (
    <>
      {/* The Organization and WebSite nodes, on the homepage and nowhere else.
          Both describe the site rather than this page, so repeating them on
          every route would be the same two claims made 28 times over — and a
          crawler that finds several copies of a node has to pick one. The apex
          is where a search engine looks for them.

          It sits out here rather than inside {@link HomeSections} because that
          function returns `<UnderConstruction />` and nothing else in a
          production build. Which of the two branches ships is not a question
          about who the club is, and putting the graph inside would have made
          production — the only deployment anybody crawls — the one place it
          went missing. */}
      <JsonLd data={siteGraph()} />
      <HomeSections streakCta={<StreakCTA />} />
    </>
  );
}

/**
 * `"use cache"` is what puts the homepage in the prerendered shell. Under Cache
 * Components everything is dynamic by default, so without it the static output
 * was the nav chrome and nothing else — 7.9 KB of shell — and every visit
 * re-rendered the entire marketing page on the server. Every section here is
 * static copy or reads the cached calendar frame, so caching is accurate.
 */
async function HomeSections({ streakCta }: { streakCta: ReactNode }) {
  "use cache";

  // Build-time, not request-time: this page is prerendered, so whatever
  // DEPLOY_ENV holds during `next build` decides which branch ships. That is
  // why cf:build and cf:deploy set it for the build and not just for the
  // Worker's runtime vars.
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

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
            section's hue — the fill is the 400 its blobs are drawn from, so a
            card is a small piece of the place it opens rather than a differently
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
          textColor="text-emerald-950"
          bg="bg-emerald-400"
          darkBg="bg-emerald-600"
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
        <MarqueeItem>Student-Run At UGA</MarqueeItem>
        <MarqueeItem>First Line Or Thousandth</MarqueeItem>
        <MarqueeItem>A Place For You</MarqueeItem>
        <MarqueeItem>Community Impact</MarqueeItem>
      </SectionMarquee>

      <ProjectsSection topEdge="fs" bottomEdge="bs" streakCta={streakCta} />

      <SectionMarquee
        slope="bs"
        bg="bg-emerald-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-emerald-100 shadow-emerald-900`}
        icon={LightningIcon}
      >
        <MarqueeItem>Real Products, Real Users</MarqueeItem>
        <MarqueeItem>Not A Toy App</MarqueeItem>
        <MarqueeItem>Shipped Every Semester</MarqueeItem>
        <MarqueeItem>100% Open Source</MarqueeItem>
        <MarqueeItem>Design, Engineering, Product</MarqueeItem>
        <MarqueeItem>Ship Every Week</MarqueeItem>
        <MarqueeItem>Build Your Streak</MarqueeItem>
        <MarqueeItem>Link Your GitHub</MarqueeItem>
      </SectionMarquee>

      <EventsSection topEdge="bs" bottomEdge="bs" />

      <SectionMarquee
        slope="bs"
        bg="bg-cyan-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-cyan-100 shadow-cyan-900`}
        icon={StarIcon}
      >
        <MarqueeItem>One Feature, One Week</MarqueeItem>
        <MarqueeItem>Every Team At Once</MarqueeItem>
        <MarqueeItem>Weekly Workshops</MarqueeItem>
        <MarqueeItem>Ship A Pull Request</MarqueeItem>
        <MarqueeItem>Build Sessions</MarqueeItem>
        <MarqueeItem>One Merges, The Rest Close</MarqueeItem>
        <MarqueeItem>Showing Up Earns The Star</MarqueeItem>
        <MarqueeItem>Some Weeks Just The Workshop</MarqueeItem>
      </SectionMarquee>

      <PartnersSection topEdge="bs" bottomEdge="fs" />

      <SectionMarquee
        slope="fs"
        bg="bg-purple-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-purple-100 shadow-purple-900`}
        icon={DiamondIcon}
      >
        <MarqueeItem>350+ Active Members</MarqueeItem>
        <MarqueeItem>Software Engineers</MarqueeItem>
        <MarqueeItem>UI Designers</MarqueeItem>
        <MarqueeItem>Data Scientists</MarqueeItem>
        <MarqueeItem>Project Leaders</MarqueeItem>
        <MarqueeItem>Community Builders</MarqueeItem>
        <MarqueeItem>Sponsorship & Recruiting</MarqueeItem>
        <MarqueeItem>Mentorship</MarqueeItem>
        <MarqueeItem>UGA Athens</MarqueeItem>
      </SectionMarquee>

      <LeadershipSection topEdge="fs" bottomEdge="flat" />
    </main>
  );
}
