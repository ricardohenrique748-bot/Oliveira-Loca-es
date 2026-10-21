/**
 * App Android do comercial (Capacitor): o mesmo código do sistema web, gerado com `vite build --mode comercial`.
 * Nesse modo só existem as telas do comercial e os arquivos (PDF, planilhas) são compartilhados em vez de baixados.
 */
import { Capacitor } from "@capacitor/core";

export const MODO_COMERCIAL = import.meta.env.VITE_APP_MODO === "comercial";

/** demonstração para o cliente (`npm run demo`): HTML único, banco embutido no navegador e sem login */
export const MODO_DEMO = import.meta.env.VITE_APP_MODO === "demo";

/** rodando dentro do app Android (e não no navegador) */
export const nativo = () => Capacitor.isNativePlatform();

/** tela inicial depois do login */
export const INICIO = MODO_COMERCIAL ? "/comercial/propostas" : "/dashboard";

// ---------- servidor escolhido no aparelho ----------
// O APK sai com o servidor do .env.comercial.local; dá para trocar pela tela de login (ex.: quando o Supabase for para a nuvem).

const CHAVE_SERVIDOR = "oliveira.servidor";
export type Servidor = { url: string; anonKey: string };

export function servidorSalvo(): Servidor | null {
  if (!MODO_COMERCIAL) return null;
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SERVIDOR) ?? "null") as Servidor | null;
    return s?.url && s.anonKey ? s : null;
  } catch {
    return null;
  }
}

export function salvarServidor(s: Servidor | null) {
  try {
    if (s) localStorage.setItem(CHAVE_SERVIDOR, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SERVIDOR);
  } catch { /* sem armazenamento: fica o servidor do build */ }
}

// ---------- arquivos ----------

/** No navegador baixa o arquivo; no app abre o compartilhar do Android (WhatsApp, e-mail, Drive, salvar). */
export async function entregarArquivo(blob: Blob, nome: string) {
  if (!nativo()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: nome, data: base64, directory: Directory.Cache });
  try {
    await Share.share({ title: nome, files: [uri] });
  } catch (e) {
    // fechar a janela de compartilhar sem escolher não é erro
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
  }
}
