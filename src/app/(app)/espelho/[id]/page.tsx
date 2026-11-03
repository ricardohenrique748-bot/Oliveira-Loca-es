import React from "react";
import { useParams } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { normalizarLinhas } from "@/lib/calculos/espelho";
import { CarregandoPagina } from "@/components/app/carregando";
import { Cabecalho, Vazio } from "@/components/app/comuns";
import { useAsyncPage } from "@/lib/use-async-page";
import { EditorEspelho } from "./client";

export default function EspelhoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("medicoes");
    if (!id) return null;
    const supabase = createClient();
    const { data: e } = await supabase.from("espelhos")
      .select(`id, competencia, linhas, total_horas, observacoes, status, token, enviado_em, respondido_em, respondido_por, motivo_recusa,
        veiculos(placa, modelo, marca), clientes(razao_social, nome_fantasia, whatsapp, email), obras(nome), contratos(numero), empresas(apelido)`)
      .eq("id", id)
      .maybeSingle();
    if (!e) return { naoEncontrado: true as const };
    return {
      espelho: {
        id: e.id,
        competencia: e.competencia,
        linhas: normalizarLinhas(e.linhas),
        total_horas: e.total_horas,
        observacoes: e.observacoes,
        status: e.status,
        token: e.token,
        enviado_em: e.enviado_em,
        respondido_em: e.respondido_em,
        respondido_por: e.respondido_por,
        motivo_recusa: e.motivo_recusa,
        placa: e.veiculos?.placa ?? "",
        modelo: [e.veiculos?.marca, e.veiculos?.modelo].filter(Boolean).join(" ") || null,
        cliente: e.clientes ? e.clientes.nome_fantasia || e.clientes.razao_social : "",
        cliente_whatsapp: e.clientes?.whatsapp ?? null,
        cliente_email: e.clientes?.email ?? null,
        obra: e.obras?.nome ?? null,
        contrato: e.contratos?.numero ?? null,
        empresa: e.empresas?.apelido ?? null,
      },
      podeEditar: podeEscrever(s.perfil, "medicoes"),
    };
  }, [id, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  if ("naoEncontrado" in data) {
    return (
      <>
        <Cabecalho titulo="Espelho" voltar={{ href: "/espelho", rotulo: "Espelhos" }} />
        <Vazio icone={FileQuestion} titulo="Espelho não encontrado" descricao="Ele pode ter sido excluído ou ser de outra empresa." />
      </>
    );
  }
  return <EditorEspelho key={data.espelho.id} {...data} />;
}
