import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Cloudflare D1 (wrangler.jsonc の d1_databases)。手元の開発では手元の SQLite に置かれる */
export function getDb(env: Pick<AppEnv, "DB">) {
  return drizzle(env.DB, { schema });
}

export type Database = ReturnType<typeof getDb>;
