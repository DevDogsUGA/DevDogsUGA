/**
 * Writes a generated file only when its content changed, and atomically.
 *
 * `docs/**` is watched by the platform's dev server, which re-runs codegen on
 * any change under it. A generator that rewrites byte-identical output would
 * wake that watcher again, forever; one that leaves an unchanged file alone
 * (same inode, same mtime) ends the loop after one pass. The temp file and
 * rename keep a reader (vinext's module graph, say) from ever seeing a
 * half-written file.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/** Resolves true when the file was written, false when it already matched. */
export function writeIfChanged(file: string, content: string): boolean {
  try {
    if (fs.readFileSync(file, "utf-8") === content) return false;
  } catch {
    // Missing or unreadable: write it.
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, "utf-8");
  fs.renameSync(temp, file);
  return true;
}
