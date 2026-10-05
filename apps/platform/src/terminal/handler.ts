import { SITE } from "@devdogsuga/newsletter";
import type { Notice } from "./blocks";
import type { RouteContext, RouteResult, TerminalRoute } from "./define";
import { renderPage, type Banner, type TerminalPage } from "./layout";
import {
  matchTerminalPath,
  TERMINAL_PREFIX,
  type TerminalFormat,
} from "./paths";
import { TERMINAL_ROUTES } from "./routes";

/**
 * Serves `/terminal/<path>`, where the Worker entry forwards curl requests
 * (see `cloudflare/worker.ts`). Matches the path, applies the route's gate
 * before any route code runs, and renders whatever comes back through the
 * one layout, including every failure: a miss, a switched-off feature, a
 * browser-only page and a thrown loader all print as terminal pages too.
 */

interface Outcome {
  status: number;
  page: TerminalPage;
  location?: string;
}

/** A page that is nothing but one notice, for every non-content outcome. */
function noticePage(
  banner: Banner,
  path: string,
  notice: Notice,
): TerminalPage {
  return {
    banner,
    accent: "rose",
    command: `cat ${path}`,
    body: [{ type: "notice", notice }],
  };
}

function notFound(path: string): Outcome {
  return {
    status: 404,
    page: {
      banner: "404",
      accent: "rose",
      aside: ["not found"],
      command: `cat ${path}`,
      body: [
        {
          type: "notice",
          notice: {
            tone: "error",
            title: `No such page: ${path}`,
            text: "Nothing here, in the terminal or the browser.",
          },
        },
        {
          type: "commands",
          items: [
            { path: "/help", description: "Every path curl can reach." },
            { path: "/", description: "The homepage." },
          ],
        },
      ],
    },
  };
}

function underConstruction(path: string): Outcome {
  return {
    status: 200,
    page: noticePage("PARTNERS", path, {
      tone: "warn",
      title: "Under construction",
      text: "This page isn't ready yet. Check back soon.",
    }),
  };
}

function browserPage(path: string, reason: string): Outcome {
  return {
    status: 200,
    page: noticePage("DEVDOGS", path, {
      tone: "info",
      title: "Open this one in a browser",
      text: reason,
      url: `${SITE}${path}`,
    }),
  };
}

async function resolve(
  route: TerminalRoute,
  context: RouteContext,
): Promise<Outcome> {
  if (route.kind === "browser") return browserPage(context.path, route.reason);

  const { gate } = route;
  if (gate.kind === "feature" && !gate.enabled()) {
    switch (gate.whenOff.kind) {
      case "notFound":
        return notFound(context.path);
      case "underConstruction":
        return underConstruction(context.path);
      case "redirect":
        return {
          status: 307,
          location: gate.whenOff.url,
          page: noticePage("DEVDOGS", context.path, {
            tone: "info",
            title: "This page lives somewhere else for now",
            text: "curl stopped at the redirect; follow it with curl -L, or open it in a browser.",
            url: gate.whenOff.url,
          }),
        };
    }
  }

  const result: RouteResult = await route.render(context);
  switch (result.kind) {
    case "page":
      return { status: 200, page: result.page };
    case "notFound":
      return notFound(context.path);
    case "underConstruction":
      return underConstruction(context.path);
  }
}

export async function terminalResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(TERMINAL_PREFIX.length) || "/";
  const format: TerminalFormat =
    url.searchParams.get("format") === "txt" ||
    url.searchParams.get("format") === "text" ||
    url.searchParams.get("format") === "plain"
      ? "plain"
      : "ansi";

  const match = matchTerminalPath(path);
  let outcome: Outcome;
  try {
    outcome = match
      ? await resolve(TERMINAL_ROUTES[match.pattern], {
          params: match.params,
          search: url.searchParams,
          path,
        })
      : notFound(path);
  } catch (error) {
    // Same as a page's error boundary: report it, and still answer in kind.
    console.error(error);
    outcome = {
      status: 500,
      page: noticePage("DEVDOGS", path, {
        tone: "error",
        title: "Something went wrong",
        text: "The server couldn't build this page. Try again in a minute, or open it in a browser.",
        url: `${SITE}${path}`,
      }),
    };
  }

  const body = renderPage(outcome.page, { path, color: format === "ansi" });
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": outcome.status === 200 ? "public, max-age=60" : "no-store",
  });
  if (outcome.location) headers.set("location", outcome.location);
  return new Response(request.method === "HEAD" ? null : body, {
    status: outcome.status,
    headers,
  });
}
