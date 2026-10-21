import React, { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { useLocation } from "react-router-dom";

/** Selo fixo avisando que é a versão de demonstração. */
export function AvisoDemo() {
  const [aberto, setAberto] = useState(true);
  const naTelaDeLogin = useLocation().pathname === "/login";
  if (!aberto && !naTelaDeLogin) return null;
  return (
    <div className="fixed bottom-3 left-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 shadow-lg backdrop-blur dark:text-amber-300">
      <FlaskConical className="h-4 w-4 shrink-0" />
      {naTelaDeLogin ? (
        <span>
          <strong>Demonstração</strong> · entre com qualquer e-mail e senha
        </span>
      ) : (
        <span>
          <strong>Demonstração</strong> · dados fictícios · o que você alterar some ao recarregar a página
        </span>
      )}
      <button type="button" onClick={() => setAberto(false)} className="ml-1 rounded p-0.5 hover:bg-amber-500/20" aria-label="Fechar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
