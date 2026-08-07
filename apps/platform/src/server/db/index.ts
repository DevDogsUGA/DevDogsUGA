import { createDb } from "@devdogsuga/drizzle";
import { env } from "~/env";
import { relations } from "./relations";

export const db = createDb(env.DB_URL, relations);
