import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import * as icons from "~/config/icons";
import { SOCIAL_LINKS } from "~/config/nav";
import {
  getFeaturedProjects,
  type ShowcaseProject,
} from "~/server/projects/showcase";

/**
 * Every featured project, in display order, each pointing at the best
 * destination it has: its live site, else wherever the fullscreen switcher
 * sends you, else its first repository. One with none of the three falls back to
 * the homepage section that describes the open ones rather than dropping out of
 * the list. The footer says what DevDogs has built, not only what is reachable
 * today.
 */
function projectLink(project: ShowcaseProject) {
  return {
    id: project.id,
    title: project.name,
    href:
      project.liveUrl ??
      project.switcherUrl ??
      project.githubUrls[0] ??
      "/#projects",
  };
}

/**
 * `"use cache"` is required, not an optimisation. This renders in the site
 * layout, above the page's own <Suspense> boundary, and the copyright line
 * reads the clock. Outside a cache scope that read would postpone the layout
 * shell itself, and every route on the site would prerender to nothing but the
 * <html> wrapper. Inside one, the year resolves at prerender time and is baked
 * into the static output, which also means it refreshes on each deploy rather
 * than per request. See docs/_shared/guides/stack/nextjs.md.
 *
 * `cacheLife("max")` is required for the same reason. A route's revalidate
 * window is the *minimum* across its cache entries, so leaving this on the
 * default 15m profile pulled every route on the site down to 15m, including
 * the docs pages, whose own `cacheLife("max")` had earned them 30d. Nothing
 * here can go stale between deploys, so "max" is accurate as well as harmless.
 *
 * Except the project list, which an officer can change between deploys. Its
 * loader (`getFeaturedProjects`) is tagged, so a toggle refreshes this scope,
 * and it carries a day's TTL as the backstop, which is what this route's window
 * now is. That is deliberately long: a shorter one would drag every route down
 * to it, as the paragraph above describes.
 */
export default async function Footer() {
  "use cache";
  cacheLife("max");

  const projectLinks = (await getFeaturedProjects()).map(projectLink);

  return (
    <footer className="footer" id="footer">
      <div className="wrap">
        <div className="footgrid">
          <div>
            <Link href="/" className="inline-block" aria-label="DevDogs home">
              <Image
                alt=""
                src="/cosmic/a/devdogs-logo-dark.png"
                width={119}
                height={32}
                unoptimized
                style={{ height: 32, width: "auto" }}
              />
            </Link>
            <p
              className="small muted"
              style={{ maxWidth: "34ch", margin: "14px 0 0" }}
            >
              UGA&rsquo;s large-scale app development club, and its Google
              Developer Group on Campus chapter.
            </p>
            <p className="small" style={{ margin: "10px 0 0" }}>
              <a href="mailto:devdogs@uga.edu">devdogs@uga.edu</a>
            </p>
            {/* Every channel the fullscreen switcher shows, in its order. The
                address above stands in for the email entry. */}
            <ul
              className="flex gap-1"
              style={{ marginTop: 12, fontSize: 20, color: "var(--text-2)" }}
            >
              {SOCIAL_LINKS.filter(
                (social) => social.icon !== "EnvelopeSimpleIcon",
              ).map((social) => {
                const Icon = social.icon ? icons[social.icon] : null;
                return (
                  <li key={social.href} className="contents">
                    <Link
                      className="iconbtn"
                      href={social.href}
                      aria-label={social.label}
                      target="_blank"
                    >
                      {Icon && <Icon />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <nav aria-label="Club">
            <h4>Club</h4>
            {/* Redirects off-site, not a page, so never prefetch. */}
            <Link href="/join" prefetch={false}>
              Join
            </Link>
            <Link href="/events">Events</Link>
            <Link href="/community">Community</Link>
            <Link href="/partners">Partners</Link>
          </nav>

          <nav aria-label="Build">
            <h4>Build</h4>
            <Link href="/docs">Docs</Link>
            <Link href="/changelog">Changelog</Link>
            {/* The organisation, not one repository: every project below
                lives under it. */}
            <Link href="https://github.com/DevDogsUGA" target="_blank">
              GitHub organization
            </Link>
            <h4 style={{ marginTop: 22 }}>Projects</h4>
            {projectLinks.map((project) => (
              <Link
                key={project.id}
                href={project.href}
                // Only the off-site destinations open a tab; "/" and the
                // homepage anchor are this same site.
                target={project.href.startsWith("http") ? "_blank" : undefined}
              >
                {project.title}
              </Link>
            ))}
          </nav>

          <nav aria-label="Newsletters">
            <h4>Newsletters</h4>
            <Link href="/newsletters/gdgc">GDGC newsletter</Link>
            <Link href="/changelog">Platform changelog</Link>
          </nav>

          <nav aria-label="Legal">
            <h4>Legal</h4>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
          </nav>
        </div>
        <div className="row tiny muted" style={{ gap: 20, marginTop: 48 }}>
          <span>&copy; {new Date().getFullYear()} DevDogs at UGA</span>
        </div>
      </div>
    </footer>
  );
}
