import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Driver-agnostic handle (postgres-js in production, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /** Keep low on Workers: each isolate should hold at most a handful of connections. */
  max?: number;
}

export function createDb(connectionString: string, options: CreateDbOptions = {}): Database {
  const client = postgres(connectionString, {
    max: options.max ?? 5,
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
  });
  return drizzle(client, { schema });
}
