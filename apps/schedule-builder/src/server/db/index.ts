import { createDb } from "@devdogsuga/db";
import { env } from "~/env";
import { relations } from "./relations";

export const db = createDb(env.DB_URL, relations);
