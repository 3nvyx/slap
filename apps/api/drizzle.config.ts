import { defineConfig } from "drizzle-kit";
// Migrations use the direct (unpooled) URL per Neon guidance.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
