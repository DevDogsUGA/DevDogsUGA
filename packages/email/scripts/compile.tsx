import { render as renderReactEmail } from "@react-email/render";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import ts from "typescript";
import type { Compiled } from "../src/runtime/fill.js";

/**
 * render → tokenize → emit.
 *
 * Each template is rendered ONCE with a `Proxy` standing in for its props, so
 * every prop access emits a `⟦key⟧` sentinel instead of a value. The rendered
 * HTML is split on those sentinels, and the pieces are what ships.
 *
 * Filling a template at runtime is then interleaving two arrays. No React, no
 * renderer, no template engine in the Worker.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const templatesDir = join(root, "src", "templates");
const generatedDir = join(root, "src", "generated");
const snapshotDir = join(root, "__snapshots__");

interface TemplateModule {
  default: ComponentType<Record<string, string>>;
  subject: (props: Record<string, string>) => string;
}

/**
 * A slot is a URL slot when its name says so.
 *
 * A convention rather than a marker API. The alternative, wrapping the access
 * in the template, does not survive the Proxy: whatever the wrapper returned
 * would be a plain string by the time React saw it, and the compiler could not
 * tell it apart from any other slot.
 */
function isUrlSlot(name: string): boolean {
  return /(?:^|[a-z])(?:Url|Href)$/.test(name) || name === "url";
}

async function main(): Promise<void> {
  const files = readdirSync(templatesDir)
    .filter((f) => f.endsWith(".tsx"))
    .sort();

  const propTypes = extractPropTypes(files.map((f) => join(templatesDir, f)));

  const compiled: Record<string, Record<string, Compiled>> = {};
  const snapshots: Record<string, string> = {};

  for (const file of files) {
    const name = file.replace(/\.tsx$/, "");
    const slots = propTypes.get(name)?.keys ?? [];

    if (slots.length === 0) {
      throw new Error(
        `${file}: no exported \`Props\` type found, or it has no members. ` +
          "The compiler derives slot names from it.",
      );
    }

    const module = (await import(
      pathToFileURL(join(templatesDir, file)).href
    )) as TemplateModule;

    const html = await compileOutput(module, slots, "html");
    const text = await compileOutput(module, slots, "text");
    const subject = compileSubject(module, slots);

    compiled[name] = { subject, html, text };

    // The snapshot is the rendered artifact with sentinels still in it, so a
    // design change shows up as a diff in review. `dist/` is gitignored and a
    // filled render would differ on every fixture tweak; this is the version
    // that is actually about the template.
    snapshots[name] = html.chunks
      .map((chunk, i) =>
        i < html.slots.length ? `${chunk}⟦${html.slots[i]}⟧` : chunk,
      )
      .join("");
  }

  emit(compiled, propTypes);

  mkdirSync(snapshotDir, { recursive: true });
  for (const [name, html] of Object.entries(snapshots)) {
    writeFileSync(join(snapshotDir, `${name}.html`), `${html}\n`);
  }

  console.log(
    `[email] compiled ${files.length} template(s): ${files
      .map((f) => f.replace(/\.tsx$/, ""))
      .join(", ")}`,
  );
}

// ── Rendering with sentinels ─────────────────────────────────────────────────

/**
 * A props object whose every access returns a marked string.
 *
 * The marker is parameterised so the same template can be rendered twice with
 * two different sentinel sets. `compileOutput` uses that to catch branching.
 */
function sentinelProps(
  slots: string[],
  wrap: (key: string) => string,
): Record<string, string> {
  const props: Record<string, string> = {};
  for (const slot of slots) props[slot] = wrap(slot);
  return props;
}

async function compileOutput(
  module: TemplateModule,
  slots: string[],
  mode: "html" | "text",
): Promise<Compiled> {
  const first = await renderWith(module, slots, (k) => `⟦${k}⟧`, mode);
  const second = await renderWith(module, slots, (k) => `⟦⟦${k}⟧⟧`, mode);

  const a = tokenize(first, slots, (k) => `⟦${k}⟧`);
  const b = tokenize(second, slots, (k) => `⟦⟦${k}⟧⟧`);

  // The branching check. The Proxy returns a string for every access, so
  // `{p.isLead ? … : …}` always takes the truthy path and silently bakes one
  // branch into the artifact. Two renders with different sentinel values must
  // produce identical structure. Anything that reads a prop's VALUE rather
  // than substituting it will disagree here.
  if (
    a.chunks.length !== b.chunks.length ||
    a.chunks.some((chunk, i) => chunk !== b.chunks[i]) ||
    a.slots.some((slot, i) => slot !== b.slots[i])
  ) {
    const at = a.chunks.findIndex((chunk, i) => chunk !== b.chunks[i]);
    throw new Error(
      `Template output changed between two sentinel sets in the ${mode} render.\n` +
        `  slots A: ${a.slots.join(", ")}\n` +
        `  slots B: ${b.slots.join(", ")}\n` +
        `  chunk ${at}\n    A: ${JSON.stringify(a.chunks[at])}\n    B: ${JSON.stringify(b.chunks[at])}\n` +
        "This means the template branches on, measures or transforms a prop " +
        "value instead of only substituting it — which would bake one branch " +
        "into the shipped artifact. Make the variant a separate template.",
    );
  }

  return a;
}

async function renderWith(
  module: TemplateModule,
  slots: string[],
  wrap: (key: string) => string,
  mode: "html" | "text",
): Promise<string> {
  const element = createElement(module.default, sentinelProps(slots, wrap));
  if (mode === "html") return renderReactEmail(element, { plainText: false });

  // Both options below are required, not cosmetic. Each turns off a default
  // that transforms prop values rather than substituting them.
  //
  //   * `wordwrap` wraps at a column count, which makes the output depend on
  //     the LENGTH of every value in it. Compiling once would bake the line
  //     breaks for a sentinel and then apply them to real names, so a long
  //     team name would push the wrap to the wrong place in every message,
  //     permanently. Unwrapped text is also what every mail client since about
  //     2005 expects to reflow itself.
  //
  //   * Headings are UPPERCASED by default, and a heading here contains a
  //     person's name. That would send "SAM ASKED TO JOIN..." in the text part
  //     while the HTML part reads normally, the same message shouting at
  //     whoever's client prefers plain text.
  return renderReactEmail(element, {
    plainText: true,
    htmlToTextOptions: {
      wordwrap: false,
      selectors: (["h1", "h2", "h3"] as const).map((selector) => ({
        selector,
        options: { uppercase: false },
      })),
    },
  });
}

function compileSubject(module: TemplateModule, slots: string[]): Compiled {
  const rendered = module.subject(sentinelProps(slots, (k) => `⟦${k}⟧`));
  return tokenize(rendered, slots, (k) => `⟦${k}⟧`);
}

/**
 * Splits rendered output on its sentinels.
 *
 * Scans left to right rather than splitting per slot, because a template may
 * use one prop several times and the chunk order has to match the slot order
 * exactly for the runtime loop to interleave them correctly.
 */
function tokenize(
  rendered: string,
  slots: string[],
  wrap: (key: string) => string,
): Compiled {
  const markers = slots.map((slot) => ({ slot, token: wrap(slot) }));
  const chunks: string[] = [];
  const found: string[] = [];

  let rest = rendered;

  for (;;) {
    let bestIndex = -1;
    let best: { slot: string; token: string } | null = null;

    for (const marker of markers) {
      const index = rest.indexOf(marker.token);
      if (index === -1) continue;
      // Longest token wins a tie so `⟦⟦x⟧⟧` is not mistaken for `⟦x⟧`.
      if (
        bestIndex === -1 ||
        index < bestIndex ||
        (index === bestIndex && marker.token.length > (best?.token.length ?? 0))
      ) {
        bestIndex = index;
        best = marker;
      }
    }

    if (best === null) break;

    chunks.push(rest.slice(0, bestIndex));
    found.push(best.slot);
    rest = rest.slice(bestIndex + best.token.length);
  }

  chunks.push(rest);

  return {
    chunks,
    slots: found,
    urlSlots: [...new Set(found.filter(isUrlSlot))],
  };
}

// ── Prop types, read from the source ─────────────────────────────────────────

interface PropType {
  keys: string[];
  /** The rendered type literal, for the generated declaration. */
  members: string[];
}

/**
 * Reads each template's exported `Props` with the TypeScript checker.
 *
 * The generated module declares the shape standalone, with no import back into
 * `src/templates`. Those files import React, and anything the build graph can
 * reach from `dist` risks pulling the renderer into the Worker bundle.
 * Deriving the declaration on every build keeps it from drifting.
 */
function extractPropTypes(files: string[]): Map<string, PropType> {
  const program = ts.createProgram(files, {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const result = new Map<string, PropType>();

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;

    const name = file
      .split("/")
      .pop()!
      .replace(/\.tsx$/, "");
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;

    const props = checker
      .getExportsOfModule(moduleSymbol)
      .find((s) => s.getName() === "Props");
    if (!props) continue;

    const type = checker.getDeclaredTypeOfSymbol(props);
    const members: string[] = [];
    const keys: string[] = [];

    for (const property of checker.getPropertiesOfType(type)) {
      const declaration =
        property.valueDeclaration ?? property.declarations?.[0];
      const propertyType = declaration
        ? checker.getTypeOfSymbolAtLocation(property, declaration)
        : checker.getDeclaredTypeOfSymbol(property);

      keys.push(property.getName());
      members.push(
        `    ${property.getName()}: ${checker.typeToString(propertyType)};`,
      );
    }

    result.set(name, { keys, members });
  }

  return result;
}

// ── Emit ─────────────────────────────────────────────────────────────────────

function emit(
  compiled: Record<string, Record<string, Compiled>>,
  propTypes: Map<string, PropType>,
): void {
  const names = Object.keys(compiled).sort();

  const body = `/**
 * GENERATED by scripts/compile.tsx. Do not edit.
 *
 * Run \`pnpm --filter @devdogsuga/email compile\` to regenerate.
 */
import type { CompiledTemplate } from "../runtime/fill.js";

export interface Templates {
${names
  .map(
    (name) => `  ${name}: {
${(propTypes.get(name)?.members ?? []).join("\n")}
  };`,
  )
  .join("\n")}
}

export const templates: Record<keyof Templates, CompiledTemplate> = ${JSON.stringify(
    compiled,
    null,
    2,
  )};
`;

  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(join(generatedDir, "templates.ts"), body);
}

await main();
