/**
 * Saving a prompted value into the developer's own `.env`.
 *
 * The DEVELOPMENT file only, by construction: the path is fixed to
 * `fileFor("development")`, so no caller can point this at a vault target's
 * file — those are what `env push` uploads, and the values this module saves
 * (`BWS_ACCESS_TOKEN`, `BWS_ORG_ID`) exist precisely to never ride a push.
 * The token is refused there by name anyway; this keeps the write itself from
 * ever being the thing that needs refusing.
 *
 * `EnvDocument.set` revives the commented line the rendered file already
 * carries (never-store keys ship as `# KEY=""` with their documentation), so
 * a saved value lands under its own doc comment rather than as a bare
 * appended line.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileFor } from "@devdogsuga/env";
import { EnvDocument } from "../env/document.js";
import { PROJECT_ROOT } from "../instance.js";

export async function saveToDevEnv(key: string, value: string): Promise<void> {
  const path = resolve(PROJECT_ROOT, fileFor("development"));
  let doc: EnvDocument;
  try {
    doc = EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    doc = EnvDocument.empty();
  }
  doc.set(key, value);
  await writeFile(path, doc.toString());
}
