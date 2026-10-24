/**
 * Writes JSON the way Prettier writes the committed config files, so a
 * proposal's diff is only the fields that changed and the repository's
 * `prettier --check` passes without a formatter in the Worker.
 *
 * The rules, read off the committed files: two-space indent; every non-empty
 * object on its own lines; an array stays on one line when it holds only
 * scalars (or empty containers) and fits in 80 columns, otherwise one element
 * per line; an array holding an object or array always breaks.
 */

const WIDTH = 80;

function scalar(value: unknown): string {
  return JSON.stringify(value);
}

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isEmpty(value: object): boolean {
  return Array.isArray(value)
    ? value.length === 0
    : Object.keys(value).length === 0;
}

function write(value: unknown, indent: number, trailing: number): string {
  if (!isContainer(value)) return scalar(value);
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const flat = !value.some((v) => isContainer(v) && !isEmpty(v));
    if (flat) {
      const oneLine = `[${value.map((v) => write(v, 0, 0)).join(", ")}]`;
      if (indent + oneLine.length + trailing <= WIDTH) return oneLine;
    }
    const items = value.map(
      (v, i) => `${inner}${write(v, indent + 2, i < value.length - 1 ? 1 : 0)}`,
    );
    return `[\n${items.join(",\n")}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return "{}";
  const rows = entries.map(([k, v], i) => {
    const head = `${inner}${scalar(k)}: `;
    return `${head}${write(v, indent + 2, i < entries.length - 1 ? 1 : 0)}`;
  });
  return `{\n${rows.join(",\n")}\n${pad}}`;
}

/** The value as a formatted JSON file, ending in a newline. */
export function formatJson(value: unknown): string {
  return `${write(value, 0, 0)}\n`;
}
