import { sql, type SQL } from "drizzle-orm";

/**
 * How a full-text search matches its words. `all` is Postgres websearch
 * syntax, every word required: right for a search box, where people type a
 * few words and expect each to narrow. `any` is for running someone's prose
 * as a query (the support widget's "similar questions" searches the title
 * and body they are writing), where requiring all thirty words finds
 * nothing; ranking puts the pages that match most of them first.
 */
export type TsMatch = "all" | "any";

export function tsQuery(query: string, match: TsMatch): SQL {
  return match === "all"
    ? sql`websearch_to_tsquery('english', ${query})`
    : // plainto_tsquery normalizes and drops stopwords, giving quoted
      // lexemes joined by " & "; swapping the operator ORs them.
      sql`replace(plainto_tsquery('english', ${query})::text, ' & ', ' | ')::tsquery`;
}

/**
 * The score to order `vector`'s matches by. Under `any`, how many of the
 * query's distinct words a row matches comes first, with ts_rank_cd (scaled
 * into [0, 1) by normalization 32) breaking ties: plain ts_rank saturates on
 * long pages, which match a few of anyone's words just by being long.
 */
export function tsScore(vector: SQL, query: string, match: TsMatch): SQL {
  if (match === "all") return sql`ts_rank(${vector}, ${tsQuery(query, "all")})`;
  return sql`(
    (select count(*)
      from unnest(tsvector_to_array(to_tsvector('english', ${query}))) as "word"
      where ${vector} @@ to_tsquery('simple', quote_literal("word")))
    + ts_rank_cd(${vector}, ${tsQuery(query, "any")}, 32)
  )`;
}
