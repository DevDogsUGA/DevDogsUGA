import { env as workerEnv } from "cloudflare:workers";
import type { WorkerVersion } from "~/server/config/reconcile";

/**
 * Which deployed Worker is answering this request.
 *
 * `version` is Cloudflare's version metadata (wrangler.jsonc's
 * `version_metadata` binding): a fresh id and upload time for every
 * `wrangler deploy`. `release` is the git SHA CI deployed, passed as the
 * `SENTRY_RELEASE` var by `backstage deploy`. Only a deployed tier
 * (staging, production) reports a version: in development the binding is
 * missing or a placeholder, and nothing should be compared against it.
 */
export function currentDeployment(): {
  version: WorkerVersion | undefined;
  release: string | undefined;
} {
  const deployed =
    process.env.DEPLOY_ENV === "staging" ||
    process.env.DEPLOY_ENV === "production";
  const metadata = deployed ? workerEnv.CF_VERSION_METADATA : undefined;
  return {
    version:
      metadata?.id && metadata.timestamp
        ? { id: metadata.id, timestamp: metadata.timestamp }
        : undefined,
    release: workerEnv.SENTRY_RELEASE,
  };
}
