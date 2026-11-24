/**
 * Applies SQL migrations in ./drizzle to DATABASE_URL.
 * For Supabase, use the direct or session-pooler connection string (port 5432).
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. (Local dev uses embedded PGlite and migrates automatically.)");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await client.end();
}
