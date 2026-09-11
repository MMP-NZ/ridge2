import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config(); // fall back to .env if present (e.g. in CI)

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) {
  throw new Error("DATABASE_MIGRATE_URL is not set (see .env.example)");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
