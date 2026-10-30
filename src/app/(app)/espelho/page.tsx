import React from "react";
import { Copy } from "lucide-react";
import { exigirSessao } from "@/lib/auth";
import { CarregandoPagina } from "@/components/app/carregando";
import { Cabecalho, Vazio } from "@/components/app/comuns";
import { useAsyncPage } from "@/lib/use-async-page";

export default function EspelhoPage() {
  const { data, loading } = useAsyncPage(async () => {
    await exigirSessao("pagar");
    return true;
  }, []);

  if (loading || !data) return <CarregandoPagina />;
  return (
    <>
      <Cabecalho titulo="Espelho" />
      <Vazio icone={Copy} titulo="Em construção" descricao="Esta aba ainda não tem conteúdo." />
    </>
  );
}
