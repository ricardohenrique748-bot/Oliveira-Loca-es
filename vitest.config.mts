import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "supabase/tests/**/*.test.ts", "api/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    environment: "node",
    env: { TZ: "America/Sao_Paulo" },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
