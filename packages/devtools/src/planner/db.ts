/**
 * The one seam between the planner commands and a real Postgres.
 *
 * Deliberately tiny: a runner of constant SQL strings and an `end()`. Every
 * query in this feature is a string literal — nothing user-shaped is ever
 * interpolated except the generated password, whose alphabet `role.ts`
 * constrains — so the interface can stay `run(text)` and the tests can hand in
 * a map from query to rows instead of mocking a client library.
 */
import postgres from "postgres";

export interface PlannerDb {
  run(query: string): Promise<Record<string, unknown>[]>;
  end(): Promise<void>;
}

/** How a caller opens one; injectable so tests never touch the network. */
export type Connect = (url: string) => PlannerDb;

/**
 * `max: 1` because every use here is a handful of sequential statements, and
 * `prepare: false` because the session pooler tolerates prepared statements
 * but gains nothing from them for one-shot queries. The timeout keeps a
 * wrong-host URL from hanging a CI job for its full step timeout.
 */
export function connectDb(url: string): PlannerDb {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });
  return {
    async run(query: string) {
      return (await sql.unsafe(query)) as unknown as Record<string, unknown>[];
    },
    async end() {
      await sql.end({ timeout: 5 });
    },
  };
}
