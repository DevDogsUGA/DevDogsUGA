import { selectKeys, type ApiKeyRow, type SelectedKeys } from "./keys";

/**
 * The Supabase Management API, confined to the endpoints this design uses.
 *
 * Confined deliberately. A general client would invite reaching for whatever
 * endpoint is convenient, and every additional endpoint is a scope the OAuth
 * app has to request — the scope set is the security boundary, and it is only
 * as tight as the code that stays inside it.
 */

const BASE = "https://api.supabase.com";

export type ManagementErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upstream_error";

export class ManagementError extends Error {
  constructor(
    readonly code: ManagementErrorCode,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Supabase Management API ${status}: ${detail}`);
    this.name = "ManagementError";
  }
}

function classify(status: number): ManagementErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new ManagementError(
      classify(res.status),
      res.status,
      (await res.text()).slice(0, 500),
    );
  }
  // 204s from pause/restore have no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export interface ProjectSummary {
  id: string;
  ref: string;
  name: string;
  status: string;
  region: string;
  organization_id: string;
}

/** Every project the grantee owns, across every organization. */
export function listProjects(token: string): Promise<ProjectSummary[]> {
  return call<ProjectSummary[]>(token, "/v1/projects");
}

/**
 * A single project, or null when it is gone.
 *
 * Null rather than a throw for 404 specifically, because "the owner deleted
 * their project" is a routine state this system has to handle rather than an
 * exception — it is the input to orphaning, and the nightly reconcile asks this
 * question about every environment on every run.
 */
export async function getProject(
  token: string,
  ref: string,
): Promise<ProjectSummary | null> {
  try {
    return await call<ProjectSummary>(token, `/v1/projects/${ref}`);
  } catch (error) {
    if (error instanceof ManagementError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

export interface CreateProjectInput {
  name: string;
  organizationId: string;
  region: string;
  dbPass: string;
}

export function createProject(
  token: string,
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  return call<ProjectSummary>(token, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      organization_id: input.organizationId,
      region: input.region,
      db_pass: input.dbPass,
    }),
  });
}

/** Selection is by `type`, never by `name` — see `keys.ts` for why. */
export async function retrieveKeys(
  token: string,
  ref: string,
): Promise<SelectedKeys> {
  return selectKeys(
    await call<ApiKeyRow[]>(token, `/v1/projects/${ref}/api-keys`),
  );
}

/**
 * Run SQL as the project owner.
 *
 * > **Measured: atomic.** A multi-statement payload with a deliberate error in
 * > the middle rolled back completely, both bare and wrapped in explicit
 * > `begin`/`commit`. A failed migration therefore leaves the schema untouched
 * > rather than half-applied, so the migration driver needs no repair path.
 *
 * **This endpoint is marked Beta**, and the entire control plane rests on it.
 * Its stability is a risk to re-check before each event; the fallback is that
 * the owner can always run migrations from their own machine with the CLI.
 */
export function runQuery(
  token: string,
  ref: string,
  query: string,
): Promise<unknown> {
  return call(token, `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export function pauseProject(token: string, ref: string): Promise<void> {
  return call<void>(token, `/v1/projects/${ref}/pause`, { method: "POST" });
}

export function restoreProject(token: string, ref: string): Promise<void> {
  return call<void>(token, `/v1/projects/${ref}/restore`, { method: "POST" });
}

/**
 * Poll until the project reports ready, or give up.
 *
 * A poll rather than a sleep. Create measured ~10s and restore ~196s, but those
 * are observations of one afternoon on one account, not a contract — and
 * `ACTIVE_HEALTHY` proved trustworthy enough that all 24 migrations applied
 * immediately after the flip, so there is no separate connectivity probe to add.
 */
export async function waitForReady(
  token: string,
  ref: string,
  opts: { timeoutMs: number; intervalMs?: number } = { timeoutMs: 300_000 },
): Promise<ProjectSummary> {
  const interval = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + opts.timeoutMs;

  for (;;) {
    const project = await getProject(token, ref);
    if (project?.status === "ACTIVE_HEALTHY") return project;
    if (Date.now() >= deadline) {
      throw new ManagementError(
        "upstream_error",
        504,
        `Project ${ref} did not reach ACTIVE_HEALTHY within ${opts.timeoutMs}ms (last status: ${project?.status ?? "gone"})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
