/**
 * The shape every extractor produces and the emitter consumes.
 *
 * Three extractors feed it, for TypeScript components/functions, the App
 * Router, and Dart via a JSON artifact, and exactly one emitter reads it. That
 * is the point of this file. A widget's constructor parameters are a props
 * table by another name, and a reader moving between the Flutter app and the
 * React apps should not have to learn a second page layout.
 *
 * Nothing here is exported from `src/index.ts`. `@devdogsuga/docs` re-exports
 * that module's types, so anything on it widens the graph `apps/platform`
 * typechecks against; the generator stays behind the `docs-build gen` CLI.
 */

/** A file and line in the repository, for the "view source" link. */
export interface SourceRef {
  /** Repo-relative, posix-separated: `apps/platform/src/ui/button.tsx`. */
  file: string;
  line: number;
}

/**
 * What a symbol is. Decided mechanically in every case. A kind that needed a
 * judgment call would rot the first time someone disagreed with the last call.
 */
export type SymbolKind =
  | "component"
  | "hook"
  | "function"
  | "constant"
  | "type"
  /* Dart */
  | "widget"
  | "class"
  | "enum"
  | "extension";

/**
 * A badge shown beside a symbol. Each is derived from the source, never from
 * metadata anyone has to maintain:
 *
 * - `server action`: `"use server"` at the top of the file. Every one of these
 *   is a client-reachable RPC entry point, so the server-actions page is a
 *   security document.
 * - `client`: `"use client"`. The most common thing to get wrong when reusing
 *   something.
 * - `default export`: changes how you import it, and 78% of the components are.
 * - `public` / `internal`: presence in the package's own `exports` map. A real
 *   public/private line that already exists in `package.json`, so it is free.
 */
export type SymbolTag =
  | "default export"
  | "client"
  | "server action"
  | "hook"
  | "public"
  | "internal"
  | "deprecated";

/** One row of a props / parameters table. */
export interface ParamDoc {
  name: string;
  /** As the checker resolves it, so `ComponentProps<typeof X>` expands. */
  type: string;
  required: boolean;
  /** Source text of the default, when there is one. */
  default: string | null;
  /** From a `@param` tag or a member's own doc comment. Usually absent. */
  description: string | null;
}

/** One documented export. */
export interface DocSymbol {
  name: string;
  kind: SymbolKind;
  /** What you type to get it: `~/ui/button`, `@devdogsuga/env`. */
  importPath: string;
  importStyle: "default" | "named";
  /**
   * The leading doc comment, verbatim and unedited, or null. Coverage is 65%
   * outside components and 25% within them, so null is the common case and the
   * layout has to read well without it.
   */
  summary: string | null;
  /** The signature as the checker prints it. Null for types. */
  signature: string | null;
  /** Props for a component, parameters for a function, ctor args for a widget. */
  params: ParamDoc[];
  /** Column heading for the params table; null when there is no table. */
  paramsLabel: "Prop" | "Parameter" | null;
  /** Resolved return type. Null when it adds nothing (`void`, a type alias). */
  returns: string | null;
  /** For `kind: "type"`: the shape, one level deep, never expanded. */
  shape: string | null;
  tags: SymbolTag[];
  source: SourceRef;
  /**
   * Which language the symbol is written in. Decides the code fence and the
   * import syntax, so a Dart widget is not rendered as TypeScript. Absent means
   * TypeScript, the common case: every extractor written before the Dart pass
   * omitted it.
   */
  language?: "typescript" | "dart";
  /**
   * Props a component inherits rather than declares: every DOM attribute that
   * arrives with `React.ComponentProps<"div">`, and every prop a Radix
   * primitive passes through.
   *
   * These are counted and named, never listed. A shadcn wrapper resolves to
   * ~300 props, two or three of which are its own. A table of 300 rows answers
   * no question a reader has; "its own two props, plus everything a `div`
   * takes" answers the one they came with.
   */
  inherited?: InheritedProps | null;
}

/** The tail of a props table that is not worth enumerating. */
export interface InheritedProps {
  count: number;
  /** Where they come from, e.g. `@types/react`, `@radix-ui/react-dialog`. */
  sources: string[];
}

/**
 * One emitted page. Grouping is per directory, one `###` per symbol. 161
 * components plus ~574 functions as individual pages would swamp a sidebar
 * holding ~40 written ones, and the folder mirrors the import path, which is
 * what a reader looks up.
 */
export interface DocGroup {
  /** Path under `docs/`, no extension: `platform/reference/components/forms`. */
  path: string;
  title: string;
  description: string;
  /** Sort key written into frontmatter. */
  order: number;
  symbols: DocSymbol[];
}

/** One row of the App Router table. */
export interface RouteEntry {
  /** Route groups contribute no segment; `[id]` and `[...slug]` survive. */
  url: string;
  /** Which files back it, repo-relative. */
  files: {
    page?: string;
    layout?: string[];
    route?: string;
    loading?: string;
    error?: string;
    notFound?: string;
    default?: string;
  };
  /** Exported HTTP methods, for a `route.ts`. Empty for a page. */
  methods: string[];
  /** `export const metadata`'s title, when statically analysable. */
  title: string | null;
  /** Route-segment config actually set: `dynamic`, `revalidate`, `runtime`… */
  config: Record<string, string>;
  isApi: boolean;
  source: SourceRef;
}

/** Per-area doc-comment coverage, printed on every run and never enforced. */
export interface CoverageRow {
  area: string;
  symbols: number;
  documented: number;
}

/** Everything one extractor produced, ready for the emitter. */
export interface ExtractResult {
  groups: DocGroup[];
  routes: RouteEntry[];
  coverage: CoverageRow[];
  /** Non-fatal problems. Warn-only, per §9.5, never a build failure. */
  warnings: string[];
}

/** An empty result, so an extractor that is skipped composes like one that ran. */
export function emptyResult(): ExtractResult {
  return { groups: [], routes: [], coverage: [], warnings: [] };
}

/** Merges extractor results in the order given. */
export function mergeResults(...results: ExtractResult[]): ExtractResult {
  return {
    groups: results.flatMap((r) => r.groups),
    routes: results.flatMap((r) => r.routes),
    coverage: results.flatMap((r) => r.coverage),
    warnings: results.flatMap((r) => r.warnings),
  };
}
