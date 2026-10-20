import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/app/(app)/layout";
import { INICIO, MODO_COMERCIAL } from "@/lib/plataforma";

// Auth & Setup
import LoginPage from "@/app/(auth)/login/page";
import ConfigurarPage from "@/app/configurar/page";
import OfflinePage from "@/app/offline/page";

// App routes
import DashboardPage from "@/app/(app)/dashboard/page";
import VeiculosPage from "@/app/(app)/cadastros/veiculos/page";
import VeiculoDetalhePage from "@/app/(app)/cadastros/veiculos/[id]/page";
import ClientesPage from "@/app/(app)/cadastros/clientes/page";
import ClienteDetalhePage from "@/app/(app)/cadastros/clientes/[id]/page";
import LocadoresPage from "@/app/(app)/cadastros/locadores/page";
import FornecedoresPage from "@/app/(app)/cadastros/fornecedores/page";
import ContasBancariasPage from "@/app/(app)/cadastros/contas-bancarias/page";
import CategoriasPage from "@/app/(app)/cadastros/categorias/page";
import EmpresasPage from "@/app/(app)/cadastros/empresas/page";
import PropostasPage from "@/app/(app)/comercial/propostas/page";
import ContratosPage from "@/app/(app)/contratos/page";
import ContratoDetalhePage from "@/app/(app)/contratos/[id]/page";
import MedicoesPage from "@/app/(app)/medicoes/page";
import ReceberPage from "@/app/(app)/receber/page";
import RepassesPage from "@/app/(app)/repasses/page";
import PagarPage from "@/app/(app)/pagar/page";
import ManutencaoPage from "@/app/(app)/manutencao/page";
import OrdensPage from "@/app/(app)/manutencao/ordens/page";
import OrdemDetalhePage from "@/app/(app)/manutencao/ordens/[id]/page";
import PlanosPage from "@/app/(app)/manutencao/planos/page";
import LeiturasPage from "@/app/(app)/manutencao/leituras/page";
import DocumentosPage from "@/app/(app)/manutencao/documentos/page";
import MultasPage from "@/app/(app)/manutencao/multas/page";
import PneusPage from "@/app/(app)/manutencao/pneus/page";
import RelatoriosPage from "@/app/(app)/relatorios/page";
import ConfiguracoesPage from "@/app/(app)/configuracoes/page";
import ImportacaoPage from "@/app/(app)/configuracoes/importacao/page";

/** app Android do comercial: login, propostas, clientes e consulta da frota (e o contrato gerado da proposta) */
function AppComercial() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/configurar" element={<ConfigurarPage />} />
      <Route path="/offline" element={<OfflinePage />} />
      <Route element={<AppLayout />}>
        <Route path="/comercial/propostas" element={<PropostasPage />} />
        <Route path="/cadastros/clientes" element={<ClientesPage />} />
        <Route path="/cadastros/clientes/:id" element={<ClienteDetalhePage />} />
        <Route path="/cadastros/veiculos" element={<VeiculosPage />} />
        <Route path="/cadastros/veiculos/:id" element={<VeiculoDetalhePage />} />
        <Route path="/contratos/:id" element={<ContratoDetalhePage />} />
      </Route>
      <Route path="*" element={<Navigate to={INICIO} replace />} />
    </Routes>
  );
}

export function App() {
  if (MODO_COMERCIAL) return <AppComercial />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/configurar" element={<ConfigurarPage />} />
      <Route path="/offline" element={<OfflinePage />} />

      {/* Rotas autenticadas protegidas pelo AppLayout */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Cadastros */}
        <Route path="/cadastros/veiculos" element={<VeiculosPage />} />
        <Route path="/cadastros/veiculos/:id" element={<VeiculoDetalhePage />} />
        <Route path="/cadastros/clientes" element={<ClientesPage />} />
        <Route path="/cadastros/clientes/:id" element={<ClienteDetalhePage />} />
        <Route path="/cadastros/locadores" element={<LocadoresPage />} />
        <Route path="/cadastros/fornecedores" element={<FornecedoresPage />} />
        <Route path="/cadastros/contas-bancarias" element={<ContasBancariasPage />} />
        <Route path="/cadastros/categorias" element={<CategoriasPage />} />
        <Route path="/cadastros/empresas" element={<EmpresasPage />} />

        {/* Comercial */}
        <Route path="/comercial/propostas" element={<PropostasPage />} />

        {/* Operação */}
        <Route path="/contratos" element={<ContratosPage />} />
        <Route path="/contratos/:id" element={<ContratoDetalhePage />} />
        <Route path="/medicoes" element={<MedicoesPage />} />
        <Route path="/receber" element={<ReceberPage />} />
        <Route path="/repasses" element={<RepassesPage />} />
        <Route path="/pagar" element={<PagarPage />} />

        {/* Manutenção / Frota */}
        <Route path="/manutencao" element={<ManutencaoPage />} />
        <Route path="/manutencao/ordens" element={<OrdensPage />} />
        <Route path="/manutencao/ordens/:id" element={<OrdemDetalhePage />} />
        <Route path="/manutencao/planos" element={<PlanosPage />} />
        <Route path="/manutencao/leituras" element={<LeiturasPage />} />
        <Route path="/manutencao/documentos" element={<DocumentosPage />} />
        <Route path="/manutencao/multas" element={<MultasPage />} />
        <Route path="/manutencao/pneus" element={<PneusPage />} />

        {/* Gestão */}
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/configuracoes/importacao" element={<ImportacaoPage />} />
      </Route>

      {/* Rota 404 padrão redireciona para dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
