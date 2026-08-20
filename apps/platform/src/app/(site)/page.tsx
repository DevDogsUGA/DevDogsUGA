import type { ReactNode } from "react";
import HeroSection from "~/components/HeroSection";
import SectionMarquee, { MarqueeItem } from "~/components/SectionMarquee";
import MissionSection from "~/components/MissionSection";
import ProjectsSection from "~/components/ProjectsSection";
import EventsSection from "~/components/EventsSection";
import PartnersSection from "~/components/PartnersSection";
import LeadershipSection from "~/components/LeadershipSection";
import StatCard from "~/ui/stat-card";
import StreakCTA from "~/components/ProjectsSection/StreakCTA";
import UnderConstruction from "~/components/UnderConstruction";

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
  return <HomeSections streakCta={<StreakCTA />} />;
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
        className="text-black"
        duration={50}
        copyZBase={10}
        aria-label="Club statistics"
      >
        <StatCard
          num="350+"
          label="Active Members"
          bg="bg-rose-400"
          darkBg="bg-rose-600"
          href="#mission"
          zIndex={3}
        />
        <StatCard
          num="3×"
          label="Weekly Events"
          bg="bg-cyan-400"
          darkBg="bg-cyan-600"
          href="#events"
          zIndex={2}
        />
        <StatCard
          num="4+"
          label="Projects Shipped"
          bg="bg-amber-400"
          darkBg="bg-amber-600"
          href="#projects"
          zIndex={1}
        />
      </SectionMarquee>

      <MissionSection topEdge="bs" bottomEdge="fs" />

      <SectionMarquee
        slope="fs"
        bg="bg-indigo-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-indigo-100 shadow-indigo-900`}
      >
        <MarqueeItem>Real Software</MarqueeItem>
        <MarqueeItem>Real Users</MarqueeItem>
        <MarqueeItem>Shipped Every Semester</MarqueeItem>
        <MarqueeItem>100% Open Source</MarqueeItem>
        <MarqueeItem>Apply Real Skills</MarqueeItem>
        <MarqueeItem>Learn By Doing</MarqueeItem>
        <MarqueeItem>Student-Built</MarqueeItem>
        <MarqueeItem>Community Impact</MarqueeItem>
      </SectionMarquee>

      <ProjectsSection topEdge="fs" bottomEdge="bs" streakCta={streakCta} />

      <SectionMarquee
        slope="bs"
        bg="bg-rose-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-rose-100 shadow-rose-900`}
      >
        <MarqueeItem>Ship every week</MarqueeItem>
        <MarqueeItem>Build your streak</MarqueeItem>
        <MarqueeItem>Link your GitHub</MarqueeItem>
        <MarqueeItem>Stay consistent</MarqueeItem>
        <MarqueeItem>Track your contributions</MarqueeItem>
        <MarqueeItem>Weekly contributors win</MarqueeItem>
        <MarqueeItem>Open source every week</MarqueeItem>
      </SectionMarquee>

      <EventsSection topEdge="bs" bottomEdge="bs" />

      <SectionMarquee
        slope="bs"
        bg="bg-teal-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-teal-100 shadow-teal-900`}
      >
        <MarqueeItem>Weekly Workshops</MarqueeItem>
        <MarqueeItem>Hackathon Presentations</MarqueeItem>
        <MarqueeItem>Build Sessions</MarqueeItem>
        <MarqueeItem>Build Every Week</MarqueeItem>
        <MarqueeItem>All Skill Levels Welcome</MarqueeItem>
        <MarqueeItem>DLW 124</MarqueeItem>
        <MarqueeItem>Fall & Spring Semesters</MarqueeItem>
      </SectionMarquee>

      <PartnersSection topEdge="bs" bottomEdge="fs" />

      <SectionMarquee
        slope="fs"
        bg="bg-rose-600"
        className={`${MARQUEE_TEXT_CLS} text-shadow-block-sm text-rose-100 shadow-rose-900`}
      >
        <MarqueeItem>Software Engineers</MarqueeItem>
        <MarqueeItem>UI Designers</MarqueeItem>
        <MarqueeItem>Data Scientists</MarqueeItem>
        <MarqueeItem>Impact-Makers</MarqueeItem>
        <MarqueeItem>Project Leaders</MarqueeItem>
        <MarqueeItem>Community Builders</MarqueeItem>
        <MarqueeItem>Open Source</MarqueeItem>
        <MarqueeItem>350+ Active Members</MarqueeItem>
        <MarqueeItem>UGA Athens</MarqueeItem>
      </SectionMarquee>

      <LeadershipSection topEdge="fs" bottomEdge="flat" />
    </main>
  );
}
