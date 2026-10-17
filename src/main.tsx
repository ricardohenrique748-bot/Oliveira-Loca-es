import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Providers } from "@/components/providers";
import App from "./App";
import "@/app/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento raiz #root não encontrado no DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Providers>
        <App />
      </Providers>
    </BrowserRouter>
  </React.StrictMode>
);
