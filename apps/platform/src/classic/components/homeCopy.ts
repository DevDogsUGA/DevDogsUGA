/**
 * The homepage's prose, in a plain module because two renderers print it:
 * the sections on `/` and the terminal's twin of that page
 * (`~/terminal/routes/home.ts`). One string each, so `curl devdogsuga.org`
 * and the browser can't describe the club two different ways.
 */

export const HERO_HEADLINE = [
  "BUILD REAL",
  "SOFTWARE.",
  "EVERY WEEK.",
] as const;

export const HERO_BLURB =
  "Learn industry standard tech and compete in hackathons, building features for projects benefitting the UGA community.";

export const MISSION_PARAGRAPHS = [
  "DevDogs is the large-scale application development club at UGA dedicated to benefitting our community through code.",
  "All of our projects are free, open-source, and designed to teach students industry-standard technologies and best-practices for collaboration in a fun and welcoming environment.",
  "Whether you’re writing your first line of code or your thousandth, there’s a place for you here.",
] as const;

export const PROJECTS_BLURB =
  "Every semester, DevDogs members collaborate across design, frontend, and backend to ship a product consumed by real users. Our projects are built by students, for students.";

export const EVENTS_BLURB =
  "DevDogs meets regularly on Mondays and Wednesdays: we host workshops, hackathons, and open build nights. Here’s what’s next.";

export const LEADERSHIP_BLURB =
  "DevDogs is led by a diverse team of UGA students across several disciplines and years.";
