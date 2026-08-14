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
 */

export type Severity = "error" | "warning" | "info";

export interface Finding {
  key: string;
  severity: Severity;
  /** Where the problem is, for grouping. */
  store: "local" | "github" | "cloudflare";
  summary: string;
}

export interface AuditInput {
  /** Active assignments in the local `.env`. */
  local: Map<string, string>;
  /** Keys present in the local `.env` but commented out. */
  localCommented?: Set<string>;
  /** The source of truth. */
  bws: Map<string, string>;
  /** GitHub environment secret names. Values are unreadable. */
  github: Set<string>;
  /** Worker name → secret names on it. Values are unreadable. */
  cloudflare?: Map<string, Set<string>>;
  /**
   * Keys that legitimately live outside Bitwarden — non-secrets, and the
   * apply-only credentials that belong to a different GitHub environment.
   */
  ignore?: ReadonlySet<string>;
}

export function audit(input: AuditInput): Finding[] {
  const ignore = input.ignore ?? new Set<string>();
  const commented = input.localCommented ?? new Set<string>();
  const findings: Finding[] = [];

  const relevant = (key: string) => !ignore.has(key);

  // ── local vs Bitwarden ─────────────────────────────────────────────────────
  // The only VALUE comparison available anywhere in this system.
  for (const [key, value] of input.local) {
    if (!relevant(key)) continue;
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
    } else if (truth !== value) {
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
  // The failure this design actually has: rotated in Bitwarden, never synced.
  for (const key of input.bws.keys()) {
    if (!relevant(key)) continue;
    if (!input.github.has(key)) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          "in Bitwarden, NOT in the GitHub environment — the deploy cannot see it",
      });
    }
  }

  for (const key of input.github) {
    if (!relevant(key)) continue;
    if (!input.bws.has(key)) {
      findings.push({
        key,
        severity: "warning",
        store: "github",
        summary:
          "in the GitHub environment, not in Bitwarden — an orphan from a " +
          "rename or a removal",
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
