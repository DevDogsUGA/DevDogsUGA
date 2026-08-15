/**
 * Four-way drift detection: local `.env`, Bitwarden, GitHub, Cloudflare.
 *
 * Each store answers a different question, and only one of them answers it
 * completely:
 *
 *   | Store      | Exposes            | So it can be checked for |
 *   |------------|--------------------|--------------------------|
 *   | local .env | names AND values   | value drift              |
 *   | Bitwarden  | names AND values   | value drift (the truth)  |
 *   | GitHub     | names + updatedAt  | presence, staleness      |
 *   | Cloudflare | names only         | presence, orphans        |
 *
 * That asymmetry is the whole design. Only the local file can be compared to
 * Bitwarden by VALUE, because the two downstream stores are write-only. So a
 * clean audit does not mean "everything matches" — it means "nothing detectable
 * is wrong", and the report says which is which rather than implying the
 * stronger claim.
 *
 * Timestamps are what rescue the GitHub half from being presence-only. Bitwarden
 * reports a `revisionDate` per secret and `gh secret list` reports `updatedAt`,
 * so "was GitHub updated after Bitwarden last changed?" IS answerable — and that
 * is the failure this design actually has, a credential rotated in Bitwarden and
 * never propagated, which a name-only check calls healthy right up until the old
 * one is revoked.
 */

export type Severity = "error" | "warning" | "info";

export interface Finding {
  key: string;
  severity: Severity;
  /** Where the problem is, for grouping. */
  store: "local" | "github" | "cloudflare";
  summary: string;
}

export interface BwsEntry {
  value: string;
  /** ISO 8601. Absent when the CLI did not report one. */
  revisionDate?: string;
}

export interface GithubEntry {
  /** Which GitHub environment this copy sits in. */
  environment: string;
  name: string;
  /** ISO 8601. */
  updatedAt?: string;
}

export interface AuditInput {
  /** Active assignments in the local `.env`. */
  local: Map<string, string>;
  /** Keys present in the local `.env` but commented out. */
  localCommented?: Set<string>;
  /** The source of truth. */
  bws: Map<string, BwsEntry>;
  /**
   * Every GitHub copy found, across every environment this project feeds.
   *
   * A list rather than a map keyed by name, because one Bitwarden project can
   * feed two GitHub environments and the interesting case is a key appearing in
   * BOTH — which a name-keyed map would quietly collapse to one.
   */
  github: GithubEntry[];
  /**
   * Where a key is supposed to live. `null` means "nowhere in this
   * environment", which is ordinary rather than wrong.
   */
  route: (key: string) => string | null;
  /** Worker name → secret names on it. Values are unreadable. */
  cloudflare?: Map<string, Set<string>>;
  /** Keys that legitimately live outside Bitwarden — the non-secrets. */
  ignore?: ReadonlySet<string>;
  /**
   * Credentials that must never be stored remotely at all.
   *
   * Distinct from `ignore`, and the opposite of it: an ignored key is expected
   * somewhere else, whereas one of these appearing in ANY remote store is a
   * finding. Being in the local `.env` and nowhere else is the correct state,
   * so the ordinary "not in Bitwarden" warning must not fire for them.
   */
  neverStore?: ReadonlySet<string>;
  /**
   * Every key the registry knows. When provided, a local key outside it is
   * reported as UNDECLARED — its own category, not folded into drift, because
   * the fix is different: drift wants a push or a pull, an undeclared key
   * wants a `define()` in the owning manifest (or the line removed). It is
   * also why `secrets push` skipped it, and the audit should say so rather
   * than let "not in Bitwarden" imply pushing would help.
   */
  declared?: ReadonlySet<string>;
}

export function audit(input: AuditInput): Finding[] {
  const ignore = input.ignore ?? new Set<string>();
  const neverStore = input.neverStore ?? new Set<string>();
  const commented = input.localCommented ?? new Set<string>();
  const findings: Finding[] = [];

  const relevant = (key: string) => !ignore.has(key) && !neverStore.has(key);

  // ── must not be stored anywhere remote ─────────────────────────────────────
  // Checked first and reported as errors. `BWS_ACCESS_TOKEN` in a Bitwarden
  // project is a key locked inside the box it opens; in GitHub it would give CI
  // the ability to read every secret we have.
  for (const key of neverStore) {
    if (input.bws.has(key)) {
      findings.push({
        key,
        severity: "error",
        store: "local",
        summary:
          "must NEVER be stored in Bitwarden — delete it from the project; " +
          "it belongs in the Password Manager vault, exported per shell",
      });
    }
    for (const copy of input.github.filter((g) => g.name === key)) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          `must NEVER be a GitHub secret — delete it from \`${copy.environment}\`; ` +
          "nothing machine-shaped may authenticate to Secrets Manager",
      });
    }
    for (const [worker, names] of input.cloudflare ?? []) {
      if (!names.has(key)) continue;
      findings.push({
        key,
        severity: "error",
        store: "cloudflare",
        summary: `must NEVER be a Worker secret — delete it from ${worker}`,
      });
    }
  }

  // ── undeclared keys ────────────────────────────────────────────────────────
  // Reported once, here, and then excluded from the drift comparisons below:
  // an undeclared key is invisible to push routing, so "in your .env, not in
  // Bitwarden" would be true and useless — pushing cannot fix it.
  const undeclared = (key: string): boolean =>
    input.declared !== undefined && !input.declared.has(key);
  for (const key of input.local.keys()) {
    if (!relevant(key) || !undeclared(key)) continue;
    findings.push({
      key,
      severity: "warning",
      store: "local",
      summary:
        "in your .env but declared in no env manifest — push skips it. " +
        "Declare it with define() in the owning package's env.ts, or remove " +
        "the line",
    });
  }

  // ── local vs Bitwarden ─────────────────────────────────────────────────────
  // The only VALUE comparison available anywhere in this system.
  for (const [key, value] of input.local) {
    if (!relevant(key) || undeclared(key)) continue;
    const truth = input.bws.get(key);

    if (truth === undefined) {
      findings.push({
        key,
        severity: "warning",
        store: "local",
        summary:
          "in your .env, not in Bitwarden — either a local-only value or one " +
          "somebody forgot to push",
      });
    } else if (truth.value !== value) {
      findings.push({
        key,
        severity: "error",
        store: "local",
        summary:
          "your .env disagrees with Bitwarden — pull to take theirs, push to " +
          "take yours",
      });
    }
  }

  for (const key of input.bws.keys()) {
    if (!relevant(key)) continue;
    if (!input.local.has(key)) {
      findings.push({
        key,
        severity: commented.has(key) ? "info" : "warning",
        store: "local",
        summary: commented.has(key)
          ? "commented out in your .env; Bitwarden has a value"
          : "in Bitwarden, missing from your .env",
      });
    }
  }

  // ── Bitwarden vs GitHub ────────────────────────────────────────────────────
  for (const [key, entry] of input.bws) {
    if (!relevant(key)) continue;

    const expected = input.route(key);
    if (expected === null) continue;

    const copies = input.github.filter((g) => g.name === key);
    const here = copies.find((g) => g.environment === expected);

    // A copy somewhere it does not belong. Listed FIRST because for the
    // apply-only credentials this is the reviewer gate failing open: the token
    // is sitting in an environment that deploys with nobody in front of it.
    for (const stray of copies.filter((g) => g.environment !== expected)) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          `also set on \`${stray.environment}\`, which is not where it belongs ` +
          `(\`${expected}\`) — delete it there`,
      });
    }

    if (!here) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          `in Bitwarden, NOT in the \`${expected}\` GitHub environment — ` +
          "the deploy cannot see it",
      });
      continue;
    }

    if (isStale(entry.revisionDate, here.updatedAt)) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          "rotated in Bitwarden after GitHub was last updated — the deploy is " +
          "still using the previous value",
      });
    }
  }

  for (const copy of input.github) {
    if (!relevant(copy.name)) continue;
    if (!input.bws.has(copy.name)) {
      findings.push({
        key: copy.name,
        severity: "warning",
        store: "github",
        summary:
          `in the \`${copy.environment}\` GitHub environment, not in ` +
          "Bitwarden — an orphan from a rename or a removal",
      });
    }
  }

  // ── Bitwarden vs Cloudflare ────────────────────────────────────────────────
  // Presence only, and asymmetric on purpose: a Worker holding a secret nobody
  // stores is an orphan worth reporting, but a secret NOT on a given Worker is
  // usually correct -- DISCORD_TOKEN belongs to platform and nothing else.
  // `--secrets-file` preserves what it omits, so orphans persist indefinitely.
  for (const [worker, names] of input.cloudflare ?? []) {
    for (const name of names) {
      if (!relevant(name)) continue;
      if (!input.bws.has(name)) {
        findings.push({
          key: name,
          severity: "warning",
          store: "cloudflare",
          summary: `on ${worker}, not in Bitwarden — a renamed or dropped variable leaves its secret behind`,
        });
      }
    }
  }

  return findings.sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.key.localeCompare(b.key),
  );
}

/**
 * True when GitHub's copy predates the Bitwarden revision.
 *
 * A missing or unparseable date on either side returns false. A comparison
 * against `NaN` is false anyway, so this is only making that explicit — but the
 * reason to be explicit is that the alternative reading, "unknown means stale",
 * turns one malformed timestamp into a report that says everything is behind,
 * after which nobody reads it, including on the run where something really is.
 */
function isStale(revisionDate?: string, updatedAt?: string): boolean {
  if (!revisionDate || !updatedAt) return false;

  const revised = Date.parse(revisionDate);
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(revised) || Number.isNaN(updated)) return false;

  return updated < revised;
}

function rank(s: Severity): number {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "error");
}

export function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return "No detectable drift.";
  }
  const mark = { error: "✗", warning: "!", info: "·" } as const;
  return findings
    .map((f) => `${mark[f.severity]} ${f.key}  ${f.summary}`)
    .join("\n");
}
