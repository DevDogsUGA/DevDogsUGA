import type { TerminalPage } from "./layout";

/**
 * How a terminal route is declared. Every route states its gate up front,
 * as data, so the handler applies it before the route's own code runs and the
 * gate-parity test (`routes.test.ts`) can compare it against the page it
 * mirrors. A route can't forget a feature flag by forgetting an `if`.
 */

export interface RouteContext {
  params: Readonly<Record<string, string>>;
  search: URLSearchParams;
  /** The path the reader asked for, without the internal prefix. */
  path: string;
}

export type RouteResult =
  | { kind: "page"; page: TerminalPage }
  | { kind: "notFound" }
  /** The page's placeholder, for a section that has no content yet. */
  | { kind: "underConstruction" };

/** What a switched-off gate does, matching what the page does when it's off. */
export type GateOff =
  | { kind: "notFound" }
  | { kind: "redirect"; url: string }
  | { kind: "underConstruction" };

export type Gate =
  | { kind: "public" }
  | {
      kind: "feature";
      /**
       * The SAME predicate the page calls, imported from
       * `~/server/features` (or the module the page gets it from), never a
       * restatement of it. The parity test compares by function name.
       */
      enabled: () => boolean;
      whenOff: GateOff;
    };

export type TerminalRoute =
  | {
      kind: "terminal";
      gate: Gate;
      render: (context: RouteContext) => Promise<RouteResult> | RouteResult;
    }
  | {
      /** A page that can't be a terminal page: it gets a pointer to the browser. */
      kind: "browser";
      reason: string;
    };

export const PUBLIC: Gate = { kind: "public" };

export function gatedBy(enabled: () => boolean, whenOff: GateOff): Gate {
  return { kind: "feature", enabled, whenOff };
}

export function terminal(
  gate: Gate,
  render: (context: RouteContext) => Promise<RouteResult> | RouteResult,
): TerminalRoute {
  return { kind: "terminal", gate, render };
}

export function browserOnly(reason: string): TerminalRoute {
  return { kind: "browser", reason };
}

export function page(page: TerminalPage): RouteResult {
  return { kind: "page", page };
}

export const NOT_FOUND: RouteResult = { kind: "notFound" };
