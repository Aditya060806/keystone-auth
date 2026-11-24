import "server-only";
import path from "node:path";
import { env } from "@/lib/env";
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

type Cached = { db: Database; ready: Promise<void> };
const globalForDb = globalThis as unknown as { __db?: Cached };

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function create(): Promise<Cached> {
  if (env.databaseUrl) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false keeps this compatible with Supabase's transaction pooler.
    const client = postgres(env.databaseUrl, { prepare: false, max: 5 });
    const db = drizzle(client, { schema }) as unknown as Database;
    return { db, ready: Promise.resolve() };
  }

  // Local development: a real Postgres (compiled to WASM) persisted on disk,
  // so the app runs with zero setup. Migrations are applied automatically.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".pglite"));
  const db = drizzle(client, { schema });
  const ready = migrate(db, { migrationsFolder });
  return { db: db as unknown as Database, ready };
}

let pending: Promise<Cached> | undefined;

/** Returns the shared Drizzle instance, creating it on first use. */
export async function getDb(): Promise<Database> {
  if (!globalForDb.__db) {
    pending ??= create();
    globalForDb.__db = await pending;
  }
  await globalForDb.__db.ready;
  return globalForDb.__db.db;
}

export { schema };
