import { getSwitcherProjects } from "~/server/projects/showcase";
import { isHiddenNavigation } from "~/config/hiddenRoutes";
import Overlay from "./Overlay";
export default async function AppSwitcher() {
  return (
    <Overlay
      projects={(await getSwitcherProjects()).filter(
        (p) => !p.url || !isHiddenNavigation(p.url),
      )}
    />
  );
}
