import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { Providers } from "@/components/providers";
import App from "./App";
import { MODO_DEMO } from "@/lib/plataforma";
import { AvisoDemo } from "@/demo/aviso";
import "@/app/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento raiz #root não encontrado no DOM");
}

// Saiu versão nova enquanto a página estava aberta: os pedaços carregados sob demanda (ex.: jsPDF)
// mudaram de nome no deploy e o antigo não existe mais. Recarrega uma vez para pegar a versão atual.
window.addEventListener("vite:preloadError", (e) => {
  try {
    const ultima = Number(sessionStorage.getItem("recarregou-versao") ?? 0);
    if (Date.now() - ultima < 30_000) return; // já recarregou agora há pouco: deixa o erro aparecer em vez de entrar em loop
    sessionStorage.setItem("recarregou-versao", String(Date.now()));
  } catch {
    // sem sessionStorage: recarrega mesmo assim
  }
  e.preventDefault();
  window.location.reload();
});

// a demonstração abre direto do arquivo (file://), onde só as rotas com # funcionam
const Router = MODO_DEMO ? HashRouter : BrowserRouter;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Router>
      <Providers>
        <App />
        {MODO_DEMO && <AvisoDemo />}
      </Providers>
    </Router>
  </React.StrictMode>
);
