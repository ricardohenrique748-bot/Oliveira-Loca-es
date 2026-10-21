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
