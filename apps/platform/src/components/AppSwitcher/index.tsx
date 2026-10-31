import { getSwitcherProjects } from "~/server/projects/showcase";
import Overlay from "./Overlay";

/**
 * The fullscreen app switcher, mounted once in the site layout. A server
 * component only to read the projects an officer has put in it: the loader is
 * cached and tagged, so this adds no request-time work to a cached route, and
 * the overlay it renders (`./Overlay`) is the client component that opens and
 * closes.
 */
export default async function AppSwitcher() {
  return <Overlay projects={await getSwitcherProjects()} />;
}
