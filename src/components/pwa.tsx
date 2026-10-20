"use client";
import { useEffect } from "react";
import { MODO_COMERCIAL } from "@/lib/plataforma";

/** Registra o service worker (PWA instalável no celular da oficina). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    // no app Android os arquivos já vêm no pacote: service worker só atrapalharia a atualização
    if (process.env.NODE_ENV !== "production" || MODO_COMERCIAL || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
