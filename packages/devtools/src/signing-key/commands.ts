/**
 * `pnpm devtools signing-key <generate|import|status> --target <t>`, the
 * lifecycle of SUPABASE_JWT_SIGNING_KEY, the HS256 secret that
 * `deploy mint-token` signs the sandbox proxy token with.
 *
 * An operator group like `planner`, not a `deploy` subcommand, for the same
 * reasons: it prompts, it writes env files, and it holds
 * SUPABASE_ACCESS_TOKEN, the apply-tier credential no unattended job outside
 * `production-apply` may see. The deploy pipeline only ever READS the key
 * (`mint-token`); creating and registering it is a human's move.
 *
 *   generate  mint the secret locally and write it into .env.<target>. The
 *             only copy is the one just written: Supabase's key store is
 *             non-extractable, so the side that signs has to be the side that
 *             minted
 *   import    register that secret with the target's Supabase project as a
 *             shared-secret signing key (Management API). It lands in
 *             `standby`, which verifies custom JWTs without touching what
 *             signs user sessions. Rotation to `in_use` stays a deliberate
 *             dashboard action
 *   status    list the project's signing keys, so "did the import land" has
 *             an answer that is not the dashboard
 *
 * Two environments, two keys: `--target staging` and `--target production`
 * name different projects and different files, and nothing here defaults one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { confirm, log, note } from "@clack/prompts";
import { fileFor } from "@devdogsuga/env";
import { fingerprint } from "../fingerprint.js";
import { PROJECT_ROOT } from "../instance.js";
import { bail, unwrap } from "../ui.js";
import { EnvDocument } from "../env/document.js";
import {
  importSharedSecret,
  listSigningKeys,
  type Fetch,
  type SigningKey,
} from "./api.js";

export const SIGNING_KEY = "SUPABASE_JWT_SIGNING_KEY";

/** The deployed targets that hold a signing key. Nothing here defaults one. */
const TARGETS = ["staging", "production"] as const;
type SigningKeyTarget = (typeof TARGETS)[number];

export interface SigningKeyOptions {
  target?: string;
  fetchImpl?: Fetch;
}

function assertTarget(value: string | undefined): SigningKeyTarget {
  if (value && (TARGETS as readonly string[]).includes(value)) {
    return value as SigningKeyTarget;
  }
  bail(
    `--target must be one of ${TARGETS.join(", ")} — the two environments ` +
      "that hold a signing key, each its own project and its own secret.",
  );
}

async function readDoc(target: SigningKeyTarget): Promise<{
  path: string;
  doc: EnvDocument;
}> {
  const path = resolve(PROJECT_ROOT, fileFor(target));
  try {
    return { path, doc: EnvDocument.parse(await readFile(path, "utf8")) };
  } catch {
    return { path, doc: EnvDocument.empty() };
  }
}

/**
 * A new signing secret: 384 bits as base64url, 64 characters, past the
 * 32-character schema floor and mint-token's own check. The alphabet needs no
 * quoting in an env file and no escaping anywhere the value travels.
 */
export function generateSigningSecret(): string {
  return randomBytes(48).toString("base64url");
}

export async function runSigningKeyGenerate(
  options: SigningKeyOptions = {},
): Promise<void> {
  const target = assertTarget(options.target);
  const { path, doc } = await readDoc(target);

  const existing = doc.get(SIGNING_KEY);
  if (existing) {
    // Overwriting is rotation, and rotation has consequences the file cannot
    // see: every outstanding sandbox token dies, and the copy already imported
    // into Supabase stops matching this file. Confirmed, not refused, because
    // rotation is a legitimate reason to be here.
    const go = unwrap(
      await confirm({
        message:
          `${SIGNING_KEY} in ${fileFor(target)} already holds a value ` +
          `(${fingerprint(existing)}). Overwrite it? Every token signed ` +
          "with the old secret dies, and the key already imported into " +
          "Supabase stops matching this file until you re-import.",
        initialValue: false,
      }),
    );
    if (!go) bail();
  }

  const secret = generateSigningSecret();
  doc.set(SIGNING_KEY, secret);
  await writeFile(path, doc.toString());

  log.success(
    `Wrote ${SIGNING_KEY} (${fingerprint(secret)}) to ${fileFor(target)}.`,
  );
  note(
    [
      "Next:",
      `  1. pnpm devtools signing-key import --target ${target}`,
      "     (registers it with the Supabase project, as standby)",
      `  2. pnpm devtools env push --target ${target}`,
      "     (Bitwarden + GitHub, like every other secret)",
    ].join("\n"),
    "the secret exists only in this file until both run",
  );
}

/** SUPABASE_ACCESS_TOKEN: the ambient environment, else .env.production. */
async function accessToken(): Promise<string> {
  const ambient = process.env.SUPABASE_ACCESS_TOKEN;
  if (ambient) return ambient;
  const { doc } = await readDoc("production");
  const stored = doc.get("SUPABASE_ACCESS_TOKEN");
  if (stored) return stored;
  bail(
    "No SUPABASE_ACCESS_TOKEN. The Management API needs your personal " +
      "access token (apply-tier, devops-only): export it, or put it in " +
      ".env.production (`pnpm devtools env pull --target production`).",
  );
}

export async function runSigningKeyImport(
  options: SigningKeyOptions = {},
): Promise<void> {
  const target = assertTarget(options.target);
  const { doc } = await readDoc(target);

  const secret = doc.get(SIGNING_KEY);
  if (!secret) {
    bail(
      `${SIGNING_KEY} is empty in ${fileFor(target)} — nothing to import. ` +
        `Run \`pnpm devtools signing-key generate --target ${target}\` first.`,
    );
  }
  const projectRef = doc.get("PROJECT_REF");
  if (!projectRef) {
    bail(
      `PROJECT_REF is empty in ${fileFor(target)}, so there is no project ` +
        "to import into. Fill it in first — four other values derive from it.",
    );
  }

  const token = await accessToken();

  const go = unwrap(
    await confirm({
      message:
        `Import ${SIGNING_KEY} (${fingerprint(secret)}) into project ` +
        `${projectRef} as a standby shared-secret signing key?`,
      initialValue: false,
    }),
  );
  if (!go) bail();

  const key: SigningKey = await importSharedSecret(
    projectRef,
    token,
    secret,
    options.fetchImpl,
  );

  log.success(
    `Imported as signing key ${key.id} (${key.algorithm}, ${key.status}).`,
  );
  note(
    [
      "• standby is enough: standby keys VERIFY custom JWTs, so the minted",
      "  sandbox token resolves without touching what signs user sessions.",
      "  Promoting it to in_use is a deliberate dashboard action, not this",
      "  tool's business.",
      "• give it ~20 minutes to propagate before trusting a failed",
      "  verification (Supabase's own guidance for standby keys).",
      `• the secret itself is now non-extractable on Supabase's side — the`,
      `  copy in ${fileFor(target)} (and Bitwarden, once pushed) is the only`,
      "  one that signs. Do not lose it; `signing-key generate` + re-import",
      "  is the recovery.",
    ].join("\n"),
    "what standby means here",
  );
}

export async function runSigningKeyStatus(
  options: SigningKeyOptions = {},
): Promise<void> {
  const target = assertTarget(options.target);
  const { doc } = await readDoc(target);

  const projectRef = doc.get("PROJECT_REF");
  if (!projectRef) {
    bail(`PROJECT_REF is empty in ${fileFor(target)} — no project to ask.`);
  }
  const token = await accessToken();

  const keys = await listSigningKeys(projectRef, token, options.fetchImpl);
  if (keys.length === 0) {
    log.warn(
      `Project ${projectRef} has no signing keys — it is still on the ` +
        "legacy JWT secret. `signing-key import` registers ours.",
    );
    return;
  }
  note(
    keys
      .map(
        (k) => `• ${k.id}  ${k.algorithm}  ${k.status}  ${k.created_at ?? ""}`,
      )
      .join("\n"),
    `signing keys on ${projectRef}`,
  );
  log.info(
    "The API never returns key material, so whether an HS256 entry matches " +
      `${fileFor(target)}'s value cannot be checked from here — the first ` +
      "deployed mint-and-resolve is that check.",
  );
}
