import jack from "~/assets/jack.jpg";
import kade from "~/assets/kade.jpg";
import maya from "~/assets/maya.jpg";
import nandan from "~/assets/nandan.jpg";
import rayan from "~/assets/rayan.jpg";
import samantha from "~/assets/samantha.jpg";
import sloan from "~/assets/sloan.jpg";
import zayan from "~/assets/zayan.jpg";
import anika from "~/assets/anika.png";
import type { LeaderHoverCardProps } from "~/components/LeadershipSection/LeaderCluster/LeaderHoverCard";

export type EventType = "workshop" | "hackathon" | "devhours" | "career";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  location: string;
  start: string; // ISO 8601, e.g. "2026-05-13T18:30:00-04:00"
  end: string; // ISO 8601
  rsvpUrl?: string;
}

function iso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-04:00`;
}

function generateMonthEvents(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();

    if (dow === 1) {
      events.push({
        id: `hackathon-${year}-${month}-${d}`,
        type: "hackathon",
        title: "Hackathon Presentations",
        description:
          "Teams present the features they shipped during the sprint. See real progress, give feedback, and celebrate wins.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 18, 30),
        end: iso(year, month, d, 19, 0),
      });
      events.push({
        id: `workshop-${year}-${month}-${d}`,
        type: "workshop",
        title: "Weekly Workshop",
        description:
          "A hands-on session covering a technical concept directly relevant to the current project — taught by members, for members.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 19, 0),
        end: iso(year, month, d, 20, 0),
      });
    }

    if (dow === 4) {
      events.push({
        id: `devhours-${year}-${month}-${d}`,
        type: "devhours",
        title: "Dev / Office Hours",
        description:
          "Optional open work session. Bring your laptop, get unblocked, pair with teammates, or just ship.",
        location: "Boyd GSRC 303",
        start: iso(year, month, d, 18, 30),
        end: iso(year, month, d, 20, 0),
      });
    }
  }

  // Career placeholder — first Tuesday of next month at noon
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let d = 1; d <= 7; d++) {
    if (new Date(nextYear, nextMonth, d).getDay() === 2) {
      events.push({
        id: `career-${nextYear}-${nextMonth}-${d}`,
        type: "career",
        title: "Employer Event",
        description:
          "Network with recruiters and engineers from companies actively hiring DevDogs members.",
        location: "Boyd GSRC 303",
        start: iso(nextYear, nextMonth, d, 17, 0),
        end: iso(nextYear, nextMonth, d, 19, 0),
      });
      break;
    }
  }

  return events;
}

export const calendarEvents: CalendarEvent[] = generateMonthEvents(
  new Date().getFullYear(),
  new Date().getMonth(),
);

export function formatEventTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = s.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = e.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${startTime} – ${endTime}`;
}

export const execBoard: LeaderHoverCardProps[] = [
  {
    name: "Kade Styron",
    titles: ["President"],
    imageSrc: kade,
    pronouns: "he/him",
    year: "2026",
    majors: ["Computer Science"],
    bio: "Kade leads DevDogs with a focus on systems design and community impact. He started as a contributor in his sophomore year and has since grown the club to 350+ members.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Sloan Finger",
    titles: ["Vice President"],
    imageSrc: sloan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science", "Statistics"],
    bio: "Sloan coordinates cross-team operations and leads the DevDogs platform project. He's passionate about developer tooling and open-source collaboration.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Jack Harrington",
    titles: ["Project Manager"],
    imageSrc: jack,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science"],
    minors: ["Business Administration"],
    bio: "Jack keeps projects on track and teams aligned. He facilitates sprint planning, backlog grooming, and ensures every member's work contributes to the release.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Anika Khatri",
    titles: ["Membership & Analytics Chair"],
    imageSrc: anika,
    pronouns: "she/her",
    year: "2028",
    majors: ["Data Science"],
    minors: ["Statistics"],
    bio: "Anika drives member engagement using data. She tracks retention metrics, designs onboarding flows, and ensures every new member finds their place in the club.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Maya Castillo",
    titles: ["Social Media Manager"],
    imageSrc: maya,
    pronouns: "she/her",
    year: "2027",
    majors: ["Marketing"],
    minors: ["Computer Science"],
    bio: "Maya crafts DevDogs' voice across platforms. She produces event content, behind-the-scenes stories, and runs recruitment campaigns that bring in top talent each semester.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Samantha Scalzini",
    titles: ["UI/UX Lead"],
    imageSrc: samantha,
    pronouns: "she/her",
    year: "2026",
    majors: ["Graphic Design"],
    minors: ["Computer Science"],
    certificates: ["UX Research"],
    bio: "Samantha shapes every user-facing product decision at DevDogs. She runs design reviews, maintains the design system, and mentors members on interaction design.",
    portfolioUrl: "https://devdogsuga.org",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Nandan Praveen",
    titles: ["Post Collections Lead"],
    imageSrc: nandan,
    pronouns: "he/him",
    year: "2028",
    majors: ["Computer Science"],
    bio: "Nandan leads the data collection pipeline for the Community Resource Forum. He ensures the dataset is accurate, up-to-date, and accessible to Athens residents.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Zayan Hoodani",
    titles: ["Event Pipeline Lead"],
    imageSrc: zayan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science", "Mathematics"],
    bio: "Zayan builds the event ingestion and scheduling infrastructure that powers DevDogs' weekly workshops and presentations. He loves systems architecture and automation.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
  {
    name: "Rayan Batada",
    titles: ["Recommendation Engine Lead"],
    imageSrc: rayan,
    pronouns: "he/him",
    year: "2027",
    majors: ["Computer Science"],
    minors: ["Statistics"],
    bio: "Rayan develops the ML-powered recommendation engine that personalises resource discovery for Athens community members. He's particularly interested in applied NLP.",
    githubUrl: "https://github.com/DevDogs-UGA",
    linkedinUrl: "https://linkedin.com/company/DevDogs-UGA",
    email: "devdogs@uga.edu",
  },
];
