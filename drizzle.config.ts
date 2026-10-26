import { defineConfig } from "drizzle-kit";

// マイグレーションの SQL を作るだけ。D1 への適用は wrangler で行う (package.json の db:migrate)
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
