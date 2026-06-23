import { config as loadEnv } from "dotenv";
// Prisma CLI nečte .env.local (to je konvence Next.js) — načteme ho ručně.
loadEnv({ path: ".env.local" });
loadEnv(); // fallback na .env

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
