import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "next/link": path.resolve(rootDir, "./src/lib/router.tsx"),
      "next/navigation": path.resolve(rootDir, "./src/lib/router.tsx"),
      "next-themes": path.resolve(rootDir, "./src/components/theme-provider.tsx"),
    },
  },
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    port: 3000,
    open: false,
  },
});
