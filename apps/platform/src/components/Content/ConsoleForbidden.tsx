import { headers } from "next/headers";
import { visibleConsoleItems } from "~/config/nav";
import { consoleSectionFor } from "~/lib/consoleSection";
import { getCallerContext } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import AccessDenied from "./AccessDenied";
import NotFoundPage from "./NotFoundPage";

/**
 * What a `forbidden()` renders. It works out which card from the caller: a
 * member with no console permission at all gets the general one; an officer
 * gets the card for the section the path belongs to, with the way back to the
 * first section they can use. `x-request-path` is set by the middleware for
 * `/console`.
 */
export default async function ConsoleForbidden() {
  const userId = await expectSession().catch(() => null);
  // `forbidden()` is only thrown for a signed-in caller; a signed-out one
  // gets the 404 everywhere under the console.
  if (!userId) return <NotFoundPage />;

  const { resolvedPermissions } = await getCallerContext(userId);
  const open = visibleConsoleItems(resolvedPermissions);
  const section = consoleSectionFor((await headers()).get("x-request-path"));

  if (open.length === 0)
    return <AccessDenied section={null} consoleHref={null} />;
  return (
    <AccessDenied
      section={section?.label ?? "this section"}
      consoleHref={open[0]!.href}
    />
  );
}
