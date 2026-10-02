/**
 * The reader's setup choices for docs variants: which platform they are on,
 * and whether their Supabase is hosted or local. `@devdogsuga/docs-kit`
 * ships every variant of a page (a tab per platform, a block per database);
 * this picks which one shows.
 *
 * A choice is stored as the reader made it and resolved per project, because
 * the projects offer different values. Native Windows exists only where a
 * project's own `index.md` lists it (study-group-finder's Flutter runs there),
 * so a reader who picked it and then opens the platform docs gets WSL2, the
 * way that project is set up on Windows, and gets native Windows back on the
 * next study-group-finder page. Resolving at read time rather than rewriting
 * the stored choice is what makes that round trip work.
 */

/** localStorage key, one JSON object for every group. */
export const DOCS_VARIANTS_KEY = "docs:variants";

/** The element whose `data-os`/`data-supabase` the docs CSS keys on. */
export const DOCS_VARIANTS_ROOT_ID = "docs-variants";

/** Values each group offers in one project, in display order. */
export type OfferedVariants = Record<string, readonly string[]>;

export type VariantPrefs = Record<string, string | undefined>;

/**
 * A first guess at the reader's platform, used until they pick one. Windows
 * guesses native, which `resolveVariant` turns into WSL2 wherever a project
 * does not offer native.
 */
export function guessOs(userAgent: string): string {
  if (/Mac|iPhone|iPad/.test(userAgent)) return "macos";
  if (userAgent.includes("Windows")) return "windows";
  return "linux";
}

/** The value a group shows in one project, from what the reader chose. */
export function resolveVariant(
  group: string,
  chosen: string | undefined,
  offered: readonly string[],
): string {
  if (chosen !== undefined && offered.includes(chosen)) return chosen;
  if (group === "os" && chosen === "windows" && offered.includes("wsl")) {
    return "wsl";
  }
  return offered[0]!;
}

export function parsePrefs(raw: string | null): VariantPrefs {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as VariantPrefs)
      : {};
  } catch {
    return {};
  }
}

/**
 * An inline script that sets the resolved values on its own parent element as
 * the HTML parses, so the right variant is the first one painted. React has
 * not hydrated yet at that point, which is why this is a string: it cannot
 * import anything. It restates `guessOs`, `resolveVariant` and `parsePrefs`,
 * and docsVariants.test.ts runs it against them so the two stay in step.
 */
export function prePaintScript(offered: OfferedVariants): string {
  return `(function(el){try{var o=${JSON.stringify(offered)},p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(DOCS_VARIANTS_KEY)}))||{}}catch(e){}var u=navigator.userAgent,g=/Mac|iPhone|iPad/.test(u)?"macos":/Windows/.test(u)?"windows":"linux";for(var k in o){var a=o[k],v=p[k]||(k==="os"?g:void 0);el.setAttribute("data-"+k,a.indexOf(v)>=0?v:k==="os"&&v==="windows"&&a.indexOf("wsl")>=0?"wsl":a[0])}}catch(e){}})(document.currentScript.parentElement)`;
}
