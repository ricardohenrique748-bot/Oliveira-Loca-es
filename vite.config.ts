import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react()],
    // demonstração: abre direto do arquivo, então os caminhos precisam ser relativos
    base: demo ? "./" : "/",
    resolve: {
      alias: {
        // demonstração (npm run demo): Supabase trocado pelo Postgres embutido no navegador; precisa vir antes do "@"
        ...(demo
          ? {
              "@/lib/supabase/client": path.resolve(rootDir, "./src/demo/client.ts"),
              "@/lib/supabase/admin": path.resolve(rootDir, "./src/demo/admin.ts"),
            }
          : {}),
        "@": path.resolve(rootDir, "./src"),
        "next/link": path.resolve(rootDir, "./src/lib/router.tsx"),
        "next/navigation": path.resolve(rootDir, "./src/lib/router.tsx"),
        "next-themes": path.resolve(rootDir, "./src/components/theme-provider.tsx"),
      },
    },
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    build: demo ? { modulePreload: false, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
    server: {
      port: 3000,
      open: false,
    },
  };
});
