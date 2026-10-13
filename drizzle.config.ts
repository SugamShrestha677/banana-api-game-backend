import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
dotenv.config();
// TEMPORARY: verify env loading
console.log("DATABASE_URL:", process.env.DATABASE_URL);
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema",
  out: "./src/drizzle/migrations",
  // driver: "pg",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
