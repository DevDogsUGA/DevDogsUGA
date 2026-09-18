interface WorkflowDatabaseEnv {
  readonly DEPLOY_ENV?: string;
  readonly DB_URL?: string;
  readonly HYPERDRIVE?: { readonly connectionString: string };
}

/** Resolve the database endpoint available inside a Workflow isolate. */
export function resolveWorkflowDatabaseUrl(env: WorkflowDatabaseEnv): string {
  if (env.HYPERDRIVE?.connectionString) {
    return env.HYPERDRIVE.connectionString;
  }
  if (env.DEPLOY_ENV === "development" && env.DB_URL) {
    return env.DB_URL;
  }

  if (env.DEPLOY_ENV === "development") {
    throw new Error(
      "The development schedule-builder Workflow has neither a HYPERDRIVE binding nor DB_URL. Start it through devtools, or provide DB_URL to wrangler dev with --env-file.",
    );
  }
  throw new Error(
    `The ${env.DEPLOY_ENV ?? "deployed"} schedule-builder Workflow has no HYPERDRIVE binding.`,
  );
}
