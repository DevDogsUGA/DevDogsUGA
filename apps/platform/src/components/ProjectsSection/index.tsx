import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Band } from "~/ui/band";
import { Card } from "~/ui/card";
import Badge from "~/ui/badge";
import { Tag } from "~/ui/tag";
import { TextLink } from "~/ui/text-link";
import Link from "next/link";
import { cn } from "~/lib/cn";
import { showcaseIcon } from "~/config/showcaseKeys";
import { getFeaturedProjects } from "~/server/projects/showcase";
import { PROJECT_ICONS } from "./project-icons";

/**
 * The open projects as cards on a band: the active Projects an officer has
 * featured and marked open to contributions. A featured Project that is closed
 * (the platform's own work) stays out of the grid but not out of the footer,
 * which lists every featured one.
 *
 * Each card says what the officer wrote on the Project: its status pill is
 * `showcaseLabel` ("Public alpha"), its chips are its `tags`, and its mark is
 * the one its `iconKey` names. Cached in the loader, and this section renders
 * inside the homepage's revalidated shell, so the await does not make the page
 * dynamic.
 */
export default async function ProjectsSection() {
  const openProjects = (await getFeaturedProjects()).filter(
    (project) => project.contributionMode === "open",
  );

  return (
    <Band id="projects" className="section scroll-mt-20">
      <div className="wrap">
        <div className="home-shead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Projects
            </div>
            <h2>Built by students, for students.</h2>
          </div>
          <TextLink asChild>
            <Link href="/github" prefetch={false}>
              All projects <ArrowRightIcon weight="bold" />
            </Link>
          </TextLink>
        </div>
        {/* No cards is a database nobody has featured an open Project in yet,
            not a state worth designing for: the heading and the link to every
            project still stand, and the grid closes up. */}
        {openProjects.length > 0 && (
          <div className="g2 grid" style={{ gap: 28 }}>
            {openProjects.map((project) => {
              const homeMark = showcaseIcon(project.iconKey).homeMark;
              const mark = homeMark ? PROJECT_ICONS[homeMark] : null;
              return (
                <Card key={project.id} className="quiet home-proj">
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
                    {mark ? (
                      <span
                        className={cn(
                          "home-mark",
                          homeMark === "dogpack" && "dogpack",
                        )}
                        style={{ fontSize: 44, lineHeight: 0 }}
                      >
                        <mark.Icon />
                      </span>
                    ) : (
                      <span />
                    )}
                    {project.showcaseLabel && (
                      <Badge variant="info">{project.showcaseLabel}</Badge>
                    )}
                  </div>
                  <h3 className="h2" style={{ margin: "18px 0 4px" }}>
                    {project.name}
                  </h3>
                  {project.tagline && (
                    <div className="eyebrow">{project.tagline}</div>
                  )}
                  {project.description && (
                    <p style={{ margin: "14px 0 20px" }}>
                      {project.description}
                    </p>
                  )}
                  <div className="row" style={{ gap: 6 }}>
                    {project.tags.map((name) => (
                      <Tag key={name}>{name}</Tag>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Band>
  );
}
