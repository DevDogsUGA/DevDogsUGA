/**
 * Four-way drift detection: local `.env`, Bitwarden, GitHub, Cloudflare.
 *
 * Each store answers a different question, and only one of them answers it
 * completely:
 *
 *   | Store              | Exposes           | So it can be checked for |
 *   |--------------------|-------------------|--------------------------|
 *   | local .env         | names AND values  | value drift              |
 *   | Bitwarden          | names AND values  | value drift (the truth)  |
 *   | GitHub *secrets*   | names + updatedAt | presence, staleness      |
 *   | GitHub *variables* | names AND values  | value drift              |
 *   | Cloudflare         | names only        | presence, orphans        |
 *
 * That asymmetry is the whole design. A GitHub *secret* is write-only, so a
 * clean audit of one does not mean "the values match" — it means "nothing
 * detectable is wrong", and the report says which is which rather than implying
 * the stronger claim.
 *
 * Timestamps are what rescue that row from being presence-only. Bitwarden
 * reports a `revisionDate` per secret and `gh secret list` reports `updatedAt`,
 * so "was GitHub updated after Bitwarden last changed?" IS answerable — and that
 * is the failure this design actually has, a credential rotated in Bitwarden and
 * never propagated, which a name-only check calls healthy right up until the old
 * one is revoked.
 *
 * ⚠️ GitHub *variables* are the one downstream store that needs none of that
 * reasoning: `gh variable list` returns the value, so the public per-environment
 * keys are compared exactly the way the local file is. Staleness is deliberately
 * NOT applied to them — a timestamp is a proxy for a comparison that could not
 * be made, and using the proxy where the real answer is available would report a
 * variable re-pushed with an identical value as drift. The security plan's §3.6
 * limitation ("names only… a changed value is undetectable") now holds for the
 * secret row alone.
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

/**
 * A GitHub environment *variable*: the same shape plus the thing that makes
 * variables worth having, a readable value.
 */
export interface GithubVariableEntry extends GithubEntry {
  value: string;
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
   * Every GitHub environment *variable* found, across the same environments.
   *
   * Separate from `github` rather than merged with a discriminator, because
   * GitHub genuinely allows one name to exist as both a secret and a variable
   * in one environment and resolves the ambiguity by never telling you — see
   * `deploy/write-env.ts`, which refuses that case outright. Two lists
   * can represent it; one list keyed by name cannot, and would silently pick a
   * winner.
   */
  githubVariables?: GithubVariableEntry[];
  /**
   * Keys that belong in the variable store rather than the secret store —
   * `variableKeys()` from the registry.
   *
   * Drives two things at once: which store a key is compared against, and the
   * pair of misplacement errors. Absent, every key is treated as a secret,
   * which is the pre-variables behaviour.
   */
  variables?: ReadonlySet<string>;
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
   * Credentials signed at deploy time, whose only copy is on the deploy target.
   *
   * The third category, and it sits between the other two rather than beside
   * them: unlike `ignore` it is a secret, and unlike `neverStore` there is one
   * remote store it BELONGS in. `SANDBOX_PROXY_TOKEN` is a JWT the deploy mints
   * and writes to the Worker, so being on Cloudflare and nowhere else is
   * exactly right.
   *
   * Without this set the Cloudflare pass below reads "on production-sandbox,
   * not in Bitwarden" and reports the live proxy credential as an orphan —
   * which the plan doc's §3.6 prune path then offers to delete. Marking it the
   * other obvious way, as `never-store`, inverts the error into "must NEVER be
   * a Worker secret" and is just as wrong in the opposite direction.
   */
  minted?: ReadonlySet<string>;
  /**
   * Every key the registry knows. When provided, a local key outside it is
   * reported as UNDECLARED — its own category, not folded into drift, because
   * the fix is different: drift wants a push or a pull, an undeclared key
   * wants a `define()` in the owning manifest (or the line removed). It is
   * also why `env push` skipped it, and the audit should say so rather
   * than let "not in Bitwarden" imply pushing would help.
   */
  declared?: ReadonlySet<string>;
}

export function audit(input: AuditInput): Finding[] {
  const ignore = input.ignore ?? new Set<string>();
  const neverStore = input.neverStore ?? new Set<string>();
  const minted = input.minted ?? new Set<string>();
  const commented = input.localCommented ?? new Set<string>();
  const variables = input.variables ?? new Set<string>();
  const githubVariables = input.githubVariables ?? [];
  const findings: Finding[] = [];

  const relevant = (key: string) =>
    !ignore.has(key) && !neverStore.has(key) && !minted.has(key);

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

  // ── minted at deploy time ──────────────────────────────────────────────────
  // Cloudflare is deliberately NOT checked: that is where these belong, and
  // saying so is the entire point of the category. What IS checked is the two
  // stores a minted credential must never reach, because a copy in either is a
  // long-lived token nobody rotates sitting beside one that rotates every
  // deploy — and the stale copy is the one an operator will reach for when
  // something breaks.
  for (const key of minted) {
    if (input.bws.has(key)) {
      findings.push({
        key,
        severity: "error",
        store: "local",
        summary:
          "is minted at deploy time and must not be stored in Bitwarden — " +
          "delete it from the project; the deploy signs a fresh one and " +
          "writes it straight to the Worker",
      });
    }
    for (const copy of input.github.filter((g) => g.name === key)) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          `is minted at deploy time and must not be a GitHub secret — delete ` +
          `it from \`${copy.environment}\`; what CI needs is the signing key, ` +
          "not a token somebody minted once",
      });
    }
  }

  // ── in the wrong GitHub store ──────────────────────────────────────────────
  // Errors, and reported before the drift passes, because both directions are
  // silent misconfigurations that a presence check calls healthy: the NAME is
  // in GitHub either way.
  for (const copy of input.github) {
    if (!relevant(copy.name) || !variables.has(copy.name)) continue;
    findings.push({
      key: copy.name,
      severity: "error",
      store: "github",
      summary:
        `is public and is a SECRET on \`${copy.environment}\` — delete it and ` +
        "let push set it as a variable; GitHub masks a secret's value in logs " +
        "by substring, which redacts the very links and hostnames it appears in",
    });
  }
  for (const copy of githubVariables) {
    if (!relevant(copy.name) || variables.has(copy.name)) continue;
    // Only for a key the registry calls a secret. An unrecognised name in the
    // variable store is an orphan from a rename, reported as one below —
    // calling it a leaked secret would be a guess, and a loud wrong one. With
    // no declared set there is no way to tell the two apart, so neither fires.
    if (input.declared === undefined || !input.declared.has(copy.name))
      continue;
    findings.push({
      key: copy.name,
      severity: "error",
      store: "github",
      summary:
        `is a secret and is a VARIABLE on \`${copy.environment}\` — its value ` +
        "is readable by anyone who can see the repository's Actions config, " +
        "and it is not masked in logs. Delete it there and rotate it",
    });
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
  // One pass over both stores. Which one a key is compared against is decided
  // by the registry, not by where the key happened to turn up — otherwise a
  // misplaced copy would define its own correctness and never be reported.
  for (const [key, entry] of input.bws) {
    if (!relevant(key)) continue;

    const expected = input.route(key);
    if (expected === null) continue;

    const isVariable = variables.has(key);
    const noun = isVariable ? "variable" : "secret";
    const pool: readonly GithubEntry[] = isVariable
      ? githubVariables
      : input.github;
    const copies = pool.filter((g) => g.name === key);
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
          `also set as a ${noun} on \`${stray.environment}\`, which is not ` +
          `where it belongs (\`${expected}\`) — delete it there`,
      });
    }

    if (!here) {
      findings.push({
        key,
        severity: "error",
        store: "github",
        summary:
          `in Bitwarden, NOT a ${noun} on the \`${expected}\` GitHub ` +
          "environment — the deploy cannot see it",
      });
      continue;
    }

    // The comparison a secret cannot have. Kept distinct from the missing case
    // above on purpose: "absent" is fixed by a push, "drifted" means somebody
    // edited the value in the GitHub UI and the two stores now disagree about
    // which is real — and the fix has to start by deciding that.
    if (isVariable) {
      const mine = githubVariables.find(
        (g) => g.name === key && g.environment === expected,
      );
      if (mine !== undefined && mine.value !== entry.value) {
        findings.push({
          key,
          severity: "error",
          store: "github",
          summary:
            `the \`${expected}\` GitHub variable's VALUE disagrees with ` +
            "Bitwarden — push to overwrite GitHub, or fix Bitwarden if the " +
            "edit there was the deliberate one",
        });
      }
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

  for (const copy of githubVariables) {
    if (!relevant(copy.name)) continue;
    if (!input.bws.has(copy.name)) {
      findings.push({
        key: copy.name,
        severity: "warning",
        store: "github",
        summary:
          `a variable on the \`${copy.environment}\` GitHub environment, not ` +
          "in Bitwarden — an orphan from a rename or a removal",
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
