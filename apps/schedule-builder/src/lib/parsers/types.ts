import { type db } from "~/server/db";

export type Row = Record<string, string>;

export type DrizzleTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
