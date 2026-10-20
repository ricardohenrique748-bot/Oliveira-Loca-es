import type { CapacitorConfig } from "@capacitor/cli";

/** App Android do comercial: empacota o build `--mode comercial` (npm run app:apk). */
const config: CapacitorConfig = {
  appId: "br.com.oliveiralocacoes.comercial",
  appName: "Oliveira Comercial",
  webDir: "dist-comercial",
  server: {
    // http: enquanto o Supabase roda neste computador (http://IP:54321), o app não pode ser https (bloquearia como conteúdo misto)
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0B0B0B",
  },
};

export default config;
