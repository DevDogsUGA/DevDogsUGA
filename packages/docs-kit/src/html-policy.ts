/**
 * What author-written HTML and SVG may contain, as an explicit allowlist.
 *
 * Pages are markdown with raw HTML allowed (`<details>`, small inline SVG
 * diagrams). The old check refused three things (`<script>`, `on*`
 * attributes, `javascript:` URLs) and let everything else through, which is a
 * filter, not a sanitizer: `<iframe srcdoc>`, `<form action>`, `<style>`,
 * `<svg><foreignObject>`, `<use href="https://…">`, `data:text/html` links and
 * `style="background:url(…)"` all passed it. This module inverts that. An
 * element or attribute that is not named below fails the build, naming the
 * file, the line and the construct.
 *
 * Nothing is stripped. A page that asked for something and silently lost it
 * looks fine in review and broken to readers, so the author is told instead.
 *
 * Two policies share one allowlist:
 * - `trusted`: the club's own docs, reviewed in pull requests. Adds the
 *   presentation hooks the site's stylesheet gives them (`class`, `id`).
 * - `untrusted`: documentation fetched from a project repository. No `class`,
 *   `id` or `style` (they can borrow the site's own styling to spoof its UI or
 *   clobber its DOM; the one exception is `id` on elements inside an inline
 *   `<svg>`, which gradients, clip paths and `<use>` need, but never on the
 *   `<svg>` root), no external images, and external links are forced to
 *   `rel="noopener noreferrer nofollow"` by `rehypeExternalLinks`.
 *
 * Property names below are hast's, not HTML's (`strokeWidth`, `ariaLabel`,
 * `colSpan`): that is what `rehype-raw` produces from the attribute.
 */

export type ContentTrust = "trusted" | "untrusted";

/** HTML elements an author may write. */
export const HTML_ELEMENTS: ReadonlySet<string> = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
]);

/** SVG elements an author may write: shapes, text and gradients, nothing that loads or runs. */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "use",
  "symbol",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
]);

/** Elements whose danger is worth naming instead of "not allowed". */
const KNOWN_DANGEROUS: Readonly<Record<string, string>> = {
  script: "`<script>` elements aren't allowed",
  style: "`<style>` elements aren't allowed (they restyle the whole site)",
  iframe: "`<iframe>` elements aren't allowed",
  frame: "`<frame>` elements aren't allowed",
  frameset: "`<frameset>` elements aren't allowed",
  object: "`<object>` elements aren't allowed",
  embed: "`<embed>` elements aren't allowed",
  applet: "`<applet>` elements aren't allowed",
  form: "`<form>` elements aren't allowed (they can post to another site)",
  input: "`<input>` elements aren't allowed",
  button: "`<button>` elements aren't allowed",
  textarea: "`<textarea>` elements aren't allowed",
  select: "`<select>` elements aren't allowed",
  option: "`<option>` elements aren't allowed",
  link: "`<link>` elements aren't allowed",
  meta: "`<meta>` elements aren't allowed",
  base: "`<base>` elements aren't allowed (it redirects every relative link)",
  template: "`<template>` elements aren't allowed",
  noscript: "`<noscript>` elements aren't allowed",
  math: "`<math>` elements aren't allowed (write formulas with $…$ instead)",
  video: "`<video>` elements aren't allowed",
  audio: "`<audio>` elements aren't allowed",
  source: "`<source>` elements aren't allowed",
  track: "`<track>` elements aren't allowed",
  canvas: "`<canvas>` elements aren't allowed",
  dialog: "`<dialog>` elements aren't allowed",
  portal: "`<portal>` elements aren't allowed",
  foreignObject:
    "`<foreignObject>` isn't allowed in SVG (it embeds arbitrary HTML)",
  animate: "SVG animation (`<animate>`) isn't allowed",
  animateMotion: "SVG animation (`<animateMotion>`) isn't allowed",
  animateTransform: "SVG animation (`<animateTransform>`) isn't allowed",
  set: "SVG animation (`<set>`) isn't allowed",
  image: "SVG `<image>` isn't allowed (it loads another file)",
  feImage: "SVG `<feImage>` isn't allowed (it loads another file)",
  filter: "SVG `<filter>` isn't allowed",
  mask: "SVG `<mask>` isn't allowed",
  pattern: "SVG `<pattern>` isn't allowed",
  marker: "SVG `<marker>` isn't allowed",
  switch: "SVG `<switch>` isn't allowed",
  view: "SVG `<view>` isn't allowed",
  mpath: "SVG `<mpath>` isn't allowed",
};

/** Attributes any allowed element may carry. */
const GLOBAL_ATTRIBUTES: ReadonlySet<string> = new Set([
  "title",
  "lang",
  "dir",
  "ariaLabel",
  "ariaHidden",
  "ariaDescribedBy",
  "ariaLabelledBy",
  "role",
]);

/** Attributes only the club's own docs may use (see the header). */
const TRUSTED_ONLY_ATTRIBUTES: ReadonlySet<string> = new Set([
  "className",
  "id",
]);

const HTML_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height"]),
  details: new Set(["open", "name"]),
  td: new Set(["colSpan", "rowSpan", "align"]),
  th: new Set(["colSpan", "rowSpan", "align", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  q: new Set(),
  blockquote: new Set(),
  del: new Set(["dateTime"]),
  ins: new Set(["dateTime"]),
  hr: new Set(),
};

/**
 * `data-*` attributes the variants (`variants.ts`) read off a `<details>`.
 * Any other `data-*` is refused: the site's scripts key off them.
 */
const DETAILS_DATA_ATTRIBUTES: ReadonlySet<string> = new Set([
  "dataProject",
  "dataOs",
  "dataSupabase",
  "dataValue",
]);

/** Presentation and geometry attributes SVG shapes may carry. */
const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  "viewBox",
  "preserveAspectRatio",
  "xmlns",
  "xmlnsXLink",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "dx",
  "dy",
  "fill",
  "fillOpacity",
  "fillRule",
  "clipRule",
  "stroke",
  "strokeWidth",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "opacity",
  "stopColor",
  "stopOpacity",
  "offset",
  "gradientUnits",
  "gradientTransform",
  "fx",
  "fy",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "textAnchor",
  "dominantBaseline",
  "clipPath",
  "clipPathUnits",
  "href",
  "id",
  "focusable",
  "version",
]);

/** `xmlns` may only declare the SVG namespace. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

/** A hast property name as the attribute an author wrote. */
export function attributeName(property: string): string {
  if (property === "className") return "class";
  if (property === "htmlFor") return "for";
  if (property === "xLinkHref") return "xlink:href";
  if (/^xml[A-Z]/.test(property)) return property.replace(/^xml/, "xml:");
  if (/^(aria|data|on)[A-Z]/.test(property) || /^on[a-z]/.test(property)) {
    return property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  }
  return property;
}

/**
 * What a browser does to a URL before reading its scheme: strip C0 controls
 * and spaces at the ends, and drop tabs and newlines anywhere. (Entities were
 * decoded by the parser already, so `java&#9;script:` arrives as `java\tscript:`.)
 */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u0020\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]",
  "g",
);

export function normalizeUrl(value: string): string {
  return value.replace(INVISIBLE, "");
}

/** The lowercase scheme of a URL, or null for a relative one. */
export function schemeOf(value: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(normalizeUrl(value));
  return match ? match[1]!.toLowerCase() : null;
}

export interface UntrustedAssets {
  /** The page's own directory under the docs root, posix, `""` at the root. */
  dir: string;
  /** The project the docs are compiled as: its page links stay under /docs/<project>/. */
  project: string;
  /** Every approved asset, posix paths relative to the docs root. */
  assets: ReadonlySet<string>;
}

/** What `checkUrl` needs to know about where a URL was written. */
export interface UrlContext {
  trust: ContentTrust;
  untrusted?: UntrustedAssets | undefined;
}

export type UrlKind = "link" | "image" | "svg-ref";

/** Schemes a link may use. Untrusted docs get the short list. */
const TRUSTED_LINK_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "vscode",
  "vscode-insiders",
]);
const UNTRUSTED_LINK_SCHEMES = new Set(["http", "https", "mailto"]);

/** Raster formats an inline `data:` image may use; SVG data URLs can carry script. */
const SAFE_DATA_IMAGE =
  /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]*$/i;

/** Joins `rel` onto `dir`, posix; null when it climbs out of the root. */
export function resolveInside(dir: string, rel: string): string | null {
  const out: string[] = dir === "" ? [] : dir.split("/");
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/**
 * Why `value` is not an acceptable URL for this use, or null when it is.
 */
export function checkUrl(
  value: string,
  kind: UrlKind,
  ctx: UrlContext,
): string | null {
  const url = normalizeUrl(value);
  if (url === "") return null;

  if (kind === "svg-ref") {
    return url.startsWith("#")
      ? null
      : `only a same-file reference like "#shape" is allowed here (found "${clip(value)}")`;
  }

  if (url.startsWith("#")) return null;

  const scheme = schemeOf(url);
  if (scheme !== null) {
    if (kind === "image") {
      if (ctx.trust === "trusted") {
        if (scheme === "http" || scheme === "https") return null;
        if (scheme === "data" && SAFE_DATA_IMAGE.test(url)) return null;
        return `\`${scheme}:\` image URLs aren't allowed (only http(s), or a base64 png/jpeg/gif/webp data URL)`;
      }
      return `images must be files in the docs directory, not \`${scheme}:\` URLs`;
    }
    const allowed =
      ctx.trust === "trusted" ? TRUSTED_LINK_SCHEMES : UNTRUSTED_LINK_SCHEMES;
    return allowed.has(scheme)
      ? null
      : `\`${scheme}:\` links aren't allowed (${[...allowed].join(", ")} only)`;
  }

  // Protocol-relative, and the backslash forms browsers read as one.
  if (/^[\\/]{2}/.test(url) || url.startsWith("\\")) {
    if (ctx.trust === "trusted" && !url.startsWith("\\")) return null;
    return `protocol-relative and backslash URLs aren't allowed (found "${clip(value)}")`;
  }

  if (ctx.trust === "trusted") return null;

  // Untrusted from here: a relative path inside the docs directory, or a
  // site docs route (what the link rewriter turns a page link into).
  if (url.startsWith("/")) {
    // Dot segments and encoded dots would walk out of /docs/<project>/.
    let path = url.replace(/[?#].*$/, "");
    try {
      path = decodeURIComponent(path);
    } catch {
      return `"${clip(value)}" isn't a valid path`;
    }
    if (path.split(/[/\\]/).some((s) => s === ".." || s === ".")) {
      return `links must stay inside this project's docs; "." and ".." segments aren't allowed (found "${clip(value)}")`;
    }
    const home = ctx.untrusted ? `/docs/${ctx.untrusted.project}` : null;
    if (
      kind === "link" &&
      home !== null &&
      (url === home || url.startsWith(`${home}/`) || url.startsWith(`${home}#`))
    ) {
      return null;
    }
    if (kind === "link" && url.startsWith("/docs")) {
      return `links must stay inside this project's docs (found "${clip(value)}")`;
    }
    return `absolute paths aren't allowed (found "${clip(value)}"); use a relative path inside the docs directory`;
  }

  const context = ctx.untrusted;
  if (context === undefined) {
    return `relative references can't be resolved here (found "${clip(value)}")`;
  }
  const bare = url.replace(/[?#].*$/, "");
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return `"${clip(value)}" isn't a valid path`;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) {
    return `"${clip(value)}" isn't a valid path`;
  }
  const resolved = resolveInside(context.dir, decoded);
  if (resolved === null) {
    return `"${clip(value)}" climbs out of the docs directory`;
  }
  if (!context.assets.has(resolved)) {
    return kind === "image"
      ? `image "${clip(value)}" isn't an approved asset in the docs directory (png, jpg, gif, webp, avif or svg files only)`
      : `"${clip(value)}" isn't an approved asset in the docs directory; in raw HTML, link pages with a Markdown link instead`;
  }
  return null;
}

function clip(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

/** A value that smuggles a function or external reference through a presentation attribute. */
function suspiciousPresentationValue(value: string): string | null {
  const text = normalizeUrl(value).toLowerCase();
  if (
    /javascript:|vbscript:|expression\(|@import|-moz-binding|behavior:/.test(
      text,
    )
  ) {
    return "script-like value";
  }
  const urls = text.match(/url\([^)]*\)/g) ?? [];
  for (const u of urls) {
    if (!/^url\(["']?#[^)]*\)$/.test(u))
      return "`url()` other than a same-file `url(#id)`";
  }
  if (text.startsWith("data:")) return "`data:` value";
  return null;
}

export interface ElementContext {
  /** Whether this element sits inside an `<svg>`. */
  inSvg: boolean;
  url: UrlContext;
}

/**
 * The first reason `tagName` with these properties is not allowed, or null.
 * `properties` are hast's; `url` and `inSvg` say where it was written.
 */
export function elementProblem(
  tagName: string,
  properties: Readonly<Record<string, unknown>>,
  ctx: ElementContext,
): string | null {
  const { inSvg, url } = ctx;
  const isSvgRoot = tagName === "svg";
  const svgContext = inSvg || isSvgRoot;

  const known = KNOWN_DANGEROUS[tagName];
  if (svgContext) {
    if (!SVG_ELEMENTS.has(tagName)) {
      return (
        known ??
        `\`<${tagName}>\` isn't in the allowed SVG subset (${[...SVG_ELEMENTS].map((t) => `<${t}>`).join(" ")})`
      );
    }
  } else if (!HTML_ELEMENTS.has(tagName)) {
    return (
      known ??
      `\`<${tagName}>\` isn't an allowed HTML element (allowed: ${[...HTML_ELEMENTS].map((t) => `<${t}>`).join(" ")}, and a small SVG subset)`
    );
  }

  // Script-bearing attributes are named first, whatever order they were
  // written in: they are the finding an author most needs to see.
  for (const name of Object.keys(properties)) {
    if (/^on./i.test(name)) {
      return `event-handler attributes aren't allowed (\`${attributeName(name)}\` on \`<${tagName}>\`)`;
    }
  }

  const htmlOwn = svgContext ? undefined : HTML_ATTRIBUTES[tagName];
  for (const [name, raw] of Object.entries(properties)) {
    const shown = attributeName(name);
    const values = Array.isArray(raw) ? raw : [raw];
    const text = values
      .filter((v) => v !== undefined && v !== null && typeof v !== "boolean")
      .join(" ");

    if (/^on./i.test(name)) {
      return `event-handler attributes aren't allowed (\`${shown}\` on \`<${tagName}>\`)`;
    }
    if (name === "style") {
      return `\`style\` attributes aren't allowed (on \`<${tagName}>\`); use the site's own styling, or an SVG presentation attribute`;
    }

    if (name === "id" && isSvgRoot && url.trust === "untrusted") {
      return "`id` isn't allowed on the root `<svg>` (docs fetched from a project can't set ids that could clobber the site's DOM); put ids on inner gradient or clipPath elements only";
    }

    const allowed =
      GLOBAL_ATTRIBUTES.has(name) ||
      (svgContext ? SVG_ATTRIBUTES.has(name) : (htmlOwn?.has(name) ?? false)) ||
      (!svgContext &&
        tagName === "details" &&
        DETAILS_DATA_ATTRIBUTES.has(name)) ||
      (url.trust === "trusted" && TRUSTED_ONLY_ATTRIBUTES.has(name));
    if (!allowed) {
      const hint =
        name === "xLinkHref"
          ? " (use `href`)"
          : /^(className|id)$/.test(name)
            ? " (docs fetched from a project can't set it)"
            : "";
      return `the \`${shown}\` attribute isn't allowed on \`<${tagName}>\`${hint}`;
    }

    if (svgContext && name === "xmlns" && text !== SVG_NAMESPACE) {
      return `\`xmlns\` may only declare the SVG namespace (found "${clip(text)}")`;
    }
    if (svgContext && name === "xmlnsXLink" && text !== XLINK_NAMESPACE) {
      return `\`xmlns:xlink\` may only declare the XLink namespace (found "${clip(text)}")`;
    }

    // URL-carrying attributes.
    if (name === "href" || name === "src") {
      const kind: UrlKind = svgContext
        ? "svg-ref"
        : tagName === "img"
          ? "image"
          : "link";
      const why = checkUrl(text, kind, url);
      if (why !== null) return `${why} (\`${shown}\` on \`<${tagName}>\`)`;
      continue;
    }

    // Anything else: no script URLs, no external `url()` references.
    if (typeof raw === "string" || Array.isArray(raw)) {
      const suspicious = suspiciousPresentationValue(text);
      if (suspicious !== null) {
        return `${suspicious} in \`${shown}\` on \`<${tagName}>\``;
      }
    }
  }

  return null;
}

/**
 * Checks for attributes on elements the compiler itself generated (markdown
 * links, images, heading ids): they are not held to the allowlist, but a URL
 * written in markdown goes through the same scheme rules.
 */
export function generatedElementProblem(
  tagName: string,
  properties: Readonly<Record<string, unknown>>,
  url: UrlContext,
): string | null {
  for (const [name, raw] of Object.entries(properties)) {
    if (/^on./i.test(name)) {
      return `event-handler attributes aren't allowed (\`${attributeName(name)}\` on \`<${tagName}>\`)`;
    }
    if (name === "href" || name === "src") {
      const text = Array.isArray(raw)
        ? raw.join(" ")
        : typeof raw === "string"
          ? raw
          : "";
      const kind: UrlKind = tagName === "img" ? "image" : "link";
      // Generated elements are never held to the asset resolution for
      // `href`s the rewriter already made absolute; schemes still apply.
      const why = checkUrl(text, kind, url);
      if (why !== null)
        return `${why} (\`${attributeName(name)}\` on \`<${tagName}>\`)`;
    }
  }
  return null;
}
