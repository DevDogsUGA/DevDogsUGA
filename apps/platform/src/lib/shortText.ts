const MAX_LINE_CHARS = 63;
const MAX_LINES = 3;

export function wrapLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result.length >= MAX_LINES) break;
    if (line.length <= MAX_LINE_CHARS) {
      result.push(line);
      continue;
    }
    let remaining = line;
    while (remaining.length > 0 && result.length < MAX_LINES) {
      if (remaining.length <= MAX_LINE_CHARS) {
        result.push(remaining);
        remaining = "";
      } else {
        const breakAt = remaining.lastIndexOf(" ", MAX_LINE_CHARS);
        if (breakAt > 0) {
          result.push(remaining.slice(0, breakAt));
          remaining = remaining.slice(breakAt + 1);
        } else {
          result.push(remaining.slice(0, MAX_LINE_CHARS));
          remaining = remaining.slice(MAX_LINE_CHARS);
        }
      }
    }
  }
  return result;
}

/** Trims, collapses whitespace, drops empty lines, and re-wraps to `MAX_LINES` x `MAX_LINE_CHARS`. */
export function normalizeShortText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/ +/g, " "))
    .filter((line) => line.length > 0);
  return wrapLines(lines).join("\n");
}

/** Sanitizes live keystroke input: normalizes whitespace/newlines without dropping empty lines mid-edit. */
export function sanitizeShortTextInput(raw: string): string {
  const processed = raw
    .replace(/\r\n/g, "\n") // normalize Windows line endings
    .replace(/\r/g, "\n") // normalize stray carriage returns
    .replace(/[^\S \n]/g, " ") // replace other whitespace (tabs, etc.) with space
    .replace(/ {2,}/g, " ") // collapse consecutive spaces
    .replace(/^ +/gm, "") // remove leading spaces per line (may create empty lines)
    .replace(/\n{2,}/g, "\n") // collapse consecutive newlines (including newly empty lines)
    .replace(/^\n/, ""); // disallow a newline as the very first character
  return wrapLines(processed.split("\n")).join("\n");
}
