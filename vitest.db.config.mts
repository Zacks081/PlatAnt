import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Pruebas contra la base de datos LOCAL (Docker). Se corren con `pnpm test:db`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Un archivo a la vez: comparten la misma base de datos.
    fileParallelism: false,
  },
});
