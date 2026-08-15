/**
 * The deployment environments, and how one is chosen.
 *
 * Three names, one file each, no shared base:
 *
 *   | `DEPLOY_ENV`  | File              |
 *   |---------------|-------------------|
 *   | (unset)       | `.env`            |
 *   | `development` | `.env`            |
 *   | `staging`     | `.env.staging`    |
 *   | `production`  | `.env.production` |
 *
 * `.env` IS development rather than a base the others extend, and that is the
 * whole design. A base file plus overlays sounds tidier and fails in one
 * specific way: a variable present in `.env` and forgotten in
 * `.env.production` silently falls through to the development value while
 * `DEPLOY_ENV` says production. Standalone files make that a validation error
 * instead of a wrong answer.
 *
 * There is no `local` alongside `development`. To most people they are
 * synonyms, and a distinction nobody can state is a distinction people get
 * wrong.
 */

export const DEPLOY_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

export function isDeployEnvironment(value: string): value is DeployEnvironment {
  return (DEPLOY_ENVIRONMENTS as readonly string[]).includes(value);
}

/** The file a given environment reads. */
export function envFileFor(environment: DeployEnvironment): string {
  return environment === "development" ? ".env" : `.env.${environment}`;
}

export class UnknownEnvironmentError extends Error {
  constructor(readonly value: string) {
    super(
      `DEPLOY_ENV="${value}" is not one of ${DEPLOY_ENVIRONMENTS.join(", ")}.`,
    );
    this.name = "UnknownEnvironmentError";
  }
}

/**
 * Resolves `DEPLOY_ENV` to an environment, refusing anything unrecognised.
 *
 * ⚠️ AN ALLOWLIST, NOT A PARSE, and the difference is not pedantry. Treating
 * the value as a filename suffix means `DEPLOY_ENV=example` loads
 * `.env.example` — which is a real, committed file whose placeholder values
 * pass most of the schema. The app boots, looks configured, and is pointed at
 * nothing.
 *
 * The failure mode of an unrecognised value is worse than "not found" in the
 * other direction too: the old `switchEnvironment()` treated anything that was
 * not `"development"` as deployed, so a stray `DEPLOY_ENV=production-apply`
 * applied the strict schemas while every `=== "production"` gate stayed shut.
 * Configured and wrong, in both directions at once.
 */
export function resolveEnvironment(
  value: string | undefined = process.env.DEPLOY_ENV,
): DeployEnvironment {
  if (value === undefined || value === "") return "development";
  if (!isDeployEnvironment(value)) throw new UnknownEnvironmentError(value);
  return value;
}
