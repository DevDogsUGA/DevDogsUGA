/**
 * Comparing a BWS project against a GitHub environment, without values.
 *
 * GitHub secrets are **write-only**. `gh secret list` returns names and
 * `updatedAt` and there is no route, CLI or API, that returns a value. So
 * "do these match?" is not a question that can be answered, and pretending
 * otherwise would be the dangerous kind of reassurance.
 *
 * What *can* be answered is "was GitHub updated after Bitwarden last changed?",
 * because BWS reports a `revisionDate` per secret. That catches the failure
 * that actually happens — a credential rotated in Bitwarden and never
 * propagated, leaving production authenticating with the old one until it is
 * revoked — which a name-only check would call healthy.
 */

export interface SourceSecret {
  key: string;
  /** ISO 8601, from `bws secret list`. */
  revisionDate?: string;
}

export interface TargetSecret {
  name: string;
  /** ISO 8601, from `gh secret list --json`. */
  updatedAt: string;
}

export interface SyncStatus {
  /** In Bitwarden, absent from GitHub. */
  missing: string[];
  /** In both, but GitHub's copy predates the Bitwarden revision. */
  stale: string[];
  /** In GitHub, absent from Bitwarden. */
  orphaned: string[];
  /** In both, and GitHub is at least as new. */
  current: string[];
}

/**
 * Classifies every key exactly once.
 *
 * A secret with no `revisionDate` counts as current rather than stale. The
 * field is absent only when the CLI did not report one, and treating "unknown"
 * as "stale" would make the whole report cry wolf — after which nobody reads
 * it, including on the run where something really is behind.
 */
export function compareSync(
  source: SourceSecret[],
  target: TargetSecret[],
  /** Keys that legitimately do not belong in this environment. */
  ignore: readonly string[] = [],
): SyncStatus {
  const skip = new Set(ignore);
  const byName = new Map(target.map((t) => [t.name, t]));

  const status: SyncStatus = {
    missing: [],
    stale: [],
    orphaned: [],
    current: [],
  };

  for (const secret of source) {
    if (skip.has(secret.key)) continue;

    const remote = byName.get(secret.key);
    if (!remote) {
      status.missing.push(secret.key);
      continue;
    }

    if (isStale(secret.revisionDate, remote.updatedAt)) {
      status.stale.push(secret.key);
    } else {
      status.current.push(secret.key);
    }
  }

  const sourceKeys = new Set(source.map((s) => s.key));
  for (const remote of target) {
    if (!sourceKeys.has(remote.name) && !skip.has(remote.name)) {
      status.orphaned.push(remote.name);
    }
  }

  return status;
}

/**
 * True when GitHub's copy predates the Bitwarden revision.
 *
 * An unparseable date on either side returns false. A comparison against `NaN`
 * is false anyway, so this is only making that explicit — but the reason to be
 * explicit is that the alternative reading, "unknown means stale", turns one
 * malformed timestamp into a report that says everything is behind.
 */
function isStale(revisionDate: string | undefined, updatedAt: string): boolean {
  if (!revisionDate) return false;

  const revised = Date.parse(revisionDate);
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(revised) || Number.isNaN(updated)) return false;

  return updated < revised;
}

/** True when nothing needs doing. */
export function syncIsClean(status: SyncStatus): boolean {
  return (
    status.missing.length === 0 &&
    status.stale.length === 0 &&
    status.orphaned.length === 0
  );
}

export function renderStatus(status: SyncStatus, environment: string): string {
  const lines: string[] = [];

  for (const key of status.missing) lines.push(`+ ${key}  not in GitHub yet`);
  for (const key of status.stale) {
    lines.push(`~ ${key}  GitHub's copy predates the Bitwarden revision`);
  }
  for (const key of status.orphaned) {
    lines.push(`? ${key}  in ${environment}, not in Bitwarden`);
  }
  if (status.current.length > 0) {
    lines.push(``, `${status.current.length} up to date.`);
  }

  return lines.join("\n");
}
