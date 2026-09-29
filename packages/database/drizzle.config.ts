import { defineConfig } from "drizzle-kit";

// Migrations are plain SQL applied by `wrangler d1 migrations apply` (see apps/api/wrangler.jsonc),
// so drizzle-kit is only used to generate them from schema.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
});
