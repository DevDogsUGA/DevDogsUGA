import HeroSection from "~/components/HeroSection";
import SectionMarquee, { MarqueeItem } from "~/components/SectionMarquee";
import MissionSection from "~/components/MissionSection";
import ProjectsSection from "~/components/ProjectsSection";
import EventsSection from "~/components/EventsSection";
import PartnersSection from "~/components/PartnersSection";
import LeadershipSection from "~/components/LeadershipSection";
import StatCard from "~/ui/stat-card";
import UnderConstruction from "~/components/UnderConstruction";

const MARQUEE_TEXT_CLS =
  "py-4 font-display text-base font-bold tracking-widest uppercase";

export default async function HomePage() {
  if (process.env.VERCEL_ENV === "production") return <UnderConstruction />;

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

      <ProjectsSection topEdge="fs" bottomEdge="bs" />

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
        <MarqueeItem>Dev Hours</MarqueeItem>
        <MarqueeItem>Build Every Week</MarqueeItem>
        <MarqueeItem>All Skill Levels Welcome</MarqueeItem>
        <MarqueeItem>Boyd GSRC 303</MarqueeItem>
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
