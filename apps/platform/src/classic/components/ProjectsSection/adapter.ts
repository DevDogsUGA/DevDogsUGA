import type { ShowcaseProject } from "~/server/projects/showcase";
import { showcaseIcon, showcaseColor } from "~/config/showcaseKeys";
import { TECH, type TechKey } from "~/classic/config/tech";
import { isHiddenNavigation } from "~/config/hiddenRoutes";
import type { Project } from "./project";
function isTechKey(key: string): key is TechKey {
  return key in TECH;
}
export function projectCardFor(project: ShowcaseProject): Project {
  return {
    title: project.name,
    description: project.description ?? "",
    tagline: project.tagline ?? "",
    year: project.yearLabel ?? "",
    note: project.note ?? undefined,
    icon: showcaseIcon(project.iconKey).homeMark,
    titleColor: showcaseColor(project.colorKey),
    contributions: project.contributionMode === "open" ? "open" : "closed",
    badge: {
      label: project.showcaseLabel ?? "",
      bg: project.contributionMode === "open" ? "bg-cyan-400" : "bg-amber-400",
      text: "text-black",
    },
    techStack: project.tags.flatMap((tag) => {
      if (isTechKey(tag)) return [tag];
      return Object.keys(TECH)
        .filter(isTechKey)
        .filter((key) => TECH[key].label === tag);
    }),
    githubUrl: project.githubUrls[0],
    liveUrl:
      project.liveUrl && !isHiddenNavigation(project.liveUrl)
        ? { href: project.liveUrl, label: project.liveLabel ?? project.name }
        : undefined,
  };
}
