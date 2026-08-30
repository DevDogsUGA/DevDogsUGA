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
 * clean audit of one does not mean "the values match". It means "nothing
 * detectable is wrong", and the report says which is which rather than implying
 * the stronger claim.
 *
 * Timestamps are what rescue that row from being presence-only. Bitwarden
 * reports a `revisionDate` per secret and `gh secret list` reports `updatedAt`,
 * so "was GitHub updated after Bitwarden last changed?" IS answerable. That is
 * the failure this design actually has: a credential rotated in Bitwarden and
 * never propagated, which a name-only check calls healthy right up until the old
 * one is revoked.
 *
 * ⚠️ GitHub *variables* are the one downstream store that needs none of that
 * reasoning: `gh variable list` returns the value, so the public per-environment
 * keys are compared exactly the way the local file is. Staleness is deliberately
 * NOT applied to them: a timestamp is a proxy for a comparison that could not
 * be made, and using the proxy where the real answer is available would report a
 * variable re-pushed with an identical value as drift. The security plan's §3.6
 * limitation ("names only… a changed value is undetectable") now holds for the
 * secret row alone.
 *
 * ⚠️ One scope sits outside that table altogether: the repository's OWN
 * variables. Push writes environment-scoped values only, and an environment
 * variable SHADOWS a repository one of the same name, so a repository-level
 * copy of a managed key is read by nothing, drifts forever, and becomes the
 * live value on the day somebody deletes the environment copy. It is checked
 * here for the same reason §3.6's orphans are: nothing manages it, so nothing
 * else in this system would ever mention it.
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
   * BOTH, which a name-keyed map would quietly collapse to one.
   */
  github: GithubEntry[];
  /**
   * Every GitHub environment *variable* found, across the same environments.
   *
   * Separate from `github` rather than merged with a discriminator, because
   * GitHub genuinely allows one name to exist as both a secret and a variable
   * in one environment and resolves the ambiguity by never telling you. See
   * `deploy/write-env.ts`, which refuses that case outright. Two lists can
   * represent it; one list keyed by name cannot, and would silently pick a
   * winner.
   */
  githubVariables?: GithubVariableEntry[];
  /**
   * Keys that belong in the variable store rather than the secret store, from
   * `variableKeys()` in the registry.
   *
   * Drives two things at once: which store a key is compared against, and the
   * pair of misplacement errors. Absent, every key is treated as a secret,
   * which is the pre-variables behaviour.
   */
  variables?: ReadonlySet<string>;
  /**
   * Where a key is supposed to live: the PRIMARY environment, the one whose
   * absence is an error. `null` means "nowhere in this environment", which is
   * ordinary rather than wrong.
   */
  route: (key: string) => string | null;
  /**
   * Whether a copy found in some OTHER environment is legitimate.
   *
   * Separate from `route` because the two questions stopped having the same
   * answer when `production-apply` became a superset of `production`: an
   * ordinary production key is now pushed to both, so "not where `route` says"
   * no longer means "misplaced". Folding them back together reports every
   * correctly-pushed copy as a stray to delete, and a reviewer who deletes 46
   * of those learns to skim the stray finding, which is the one finding that
   * catches an apply-tier credential sitting in the unreviewed environment.
   *
   * Defaults to the old behaviour (`only where route says`), so a caller that
   * has not thought about fan-out gets the strict answer rather than a
   * permissive one.
   */
  accepted?: (key: string, environment: string) => boolean;
  /** Worker name → secret names on it. Values are unreadable. */
  cloudflare?: Map<string, Set<string>>;
  /** Keys that legitimately live outside Bitwarden: the non-secrets. */
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
   * not in Bitwarden" and reports the live proxy credential as an orphan,
   * which the plan doc's §3.6 prune path then offers to delete. Marking it the
   * other obvious way, as `never-store`, inverts the error into "must NEVER be
   * a Worker secret" and is just as wrong in the opposite direction.
   */
  minted?: ReadonlySet<string>;
  /**
   * Every key the registry knows. When provided, a local key outside it is
   * reported as UNDECLARED: its own category, not folded into drift, because
   * the fix is different: drift wants a push or a pull, an undeclared key
   * wants a `define()` in the owning manifest (or the line removed). It is
   * also why `env push` skipped it, and the audit should say so rather
   * than let "not in Bitwarden" imply pushing would help.
   */
  declared?: ReadonlySet<string>;
  /**
   * The repository's OWN variables, the scope with no environment, or the fact
   * that they could not be listed.
   *
   * A union rather than a list, because three states have to stay apart and a
   * list can only hold two of them: nobody looked (absent: the pre-existing
   * behaviour, no claim either way), looked and saw these names
   * (`readable`), and TRIED TO LOOK AND COULD NOT (`readable: false`). Listing
   * repository variables can fail where listing environment ones succeeds, so
   * the third state is ordinary rather than exotic, and collapsing it into an
   * empty list is precisely the bug this check was added to catch, one scope
   * up: a report that says "checked, nothing found" about a check that never
   * ran.
   *
   * Names only. See `GhRepositoryVariable` for why the value is deliberately
   * not fetched.
   */
  repositoryVariables?: RepositoryVariableScan;
}

/**
 * What `gh variable list` (no `--env`) returned, or why it returned nothing.
 *
 * `reason` is carried rather than dropped because the two failures need
 * different next steps and look identical from a finding that omits it: a
 * missing permission is fixed by an admin, an unauthenticated CLI by the person
 * reading the report.
 */
export type RepositoryVariableScan =
  | { readable: true; names: readonly string[] }
  | { readable: false; reason: string };

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
  // deploy, and the stale copy is the one an operator will reach for when
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
    // variable store is an orphan from a rename, reported as one below.
    // Calling it a leaked secret would be a guess, and a loud wrong one. With
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

  // ── repository-level variables ─────────────────────────────────────────────
  // The scope push never writes to, and the one a presence check cannot see
  // from inside an environment.
  //
  // ⚠️ An ENVIRONMENT variable SHADOWS a repository variable of the same name.
  // So a repository-level `AIRTABLE_BASE_ID`, which people were told to set by
  // hand before push started routing that key, is not merely redundant: it is
  // unreadable from every job, holds whatever it held the day it was set, and
  // becomes live the moment somebody deletes the environment copy. Nothing
  // manages it and nothing else here would ever mention it, which makes it the
  // same failure as the §3.6 orphan audit rather than a new one.
  const repository = input.repositoryVariables;
  if (repository !== undefined && !repository.readable) {
    // A finding, in the same list as the rest, rather than a line printed
    // underneath it: the whole hazard of this check is that its absence looks
    // like health, and a clean report with a quiet caveat below it reads as
    // clean. The key is parenthesised so it cannot be mistaken for one.
    findings.push({
      key: "(repository variables)",
      severity: "warning",
      store: "github",
      summary:
        "could not check — listing the repository's own variables failed " +
        `(${repository.reason}). This run rules out NOTHING at that scope; a ` +
        "repository variable shadowed by an environment copy would look " +
        "exactly like this report. Run `gh variable list` by hand",
    });
  }
  const repositoryNames =
    repository !== undefined && repository.readable ? repository.names : [];
  for (const name of repositoryNames) {
    // Membership in `variables` IS the declaration test for this branch, since
    // the set comes from the registry, which is why it does not also consult
    // `declared`. A caller that passed one and forgot the other would
    // otherwise get silence from the check it asked for.
    if (variables.has(name)) {
      if (!relevant(name)) continue;
      findings.push({
        key: name,
        severity: "warning",
        store: "github",
        summary:
          "is also a REPOSITORY-level GitHub variable, which push does not " +
          "manage — the environment copy shadows it, so every job reads the " +
          "environment value and this one is invisible, stale, and unnoticed " +
          "until somebody deletes that copy, whereupon it silently becomes " +
          `the live value. Delete it: \`gh variable delete ${name}\``,
      });
      continue;
    }

    // A name the registry calls a SECRET, sitting in the readable store one
    // scope up. The environment-level version of this is an error above, and
    // this is the same finding with the shadowing sentence removed, because
    // there is none: secrets and variables are separate namespaces, so nothing
    // hides this one.
    //
    // ⚠️ Filtered on `ignore` alone, deliberately NOT on the whole of
    // `relevant()`. An ignored key legitimately lives outside these stores.
    // `GITHUB_ORG` is a committed constant, and a repository variable holding
    // it is somebody making a reasonable choice. A never-store or minted
    // credential in the READABLE store is the worst case this file knows
    // about, not an exempt one, so those two fall through to the error.
    //
    // `declared` is required here for the reason it is required above: without
    // it an unrecognised name is indistinguishable from another team's
    // variable, and calling that a leaked secret would be a loud guess.
    if (ignore.has(name)) continue;
    if (input.declared === undefined || !input.declared.has(name)) continue;
    findings.push({
      key: name,
      severity: "error",
      store: "github",
      summary:
        "is a secret and is a REPOSITORY-level GitHub variable — its value " +
        "is readable by anyone who can see the repository's Actions config, " +
        "and no environment copy hides it: secrets and variables are separate " +
        `namespaces. Delete it (\`gh variable delete ${name}\`) and rotate it`,
    });
  }

  // ── undeclared keys ────────────────────────────────────────────────────────
  // Reported once, here, and then excluded from the drift comparisons below:
  // an undeclared key is invisible to push routing, so "in your .env, not in
  // Bitwarden" would be true and useless, since pushing cannot fix it.
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
  // by the registry, not by where the key happened to turn up. Otherwise a
  // misplaced copy would define its own correctness and never be reported.
  for (const [key, entry] of input.bws) {
    if (!relevant(key)) continue;

    const expected = input.route(key);
    if (expected === null) continue;
    const accepted =
      input.accepted ??
      ((_key: string, environment: string) => environment === expected);

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
    //
    // `accepted`, not `!== expected`: `production-apply` legitimately holds a
    // second copy of most production keys. An apply-tier key in `production`
    // still lands here, which is the case this finding exists for.
    for (const stray of copies.filter((g) => !accepted(key, g.environment))) {
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
    // which is real, and the fix has to start by deciding that.
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
 * against `NaN` is false anyway, so this only makes that explicit. The reason
 * to be explicit is that the alternative reading, "unknown means stale",
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
