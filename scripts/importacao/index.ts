/**
 * Importação das planilhas atuais para o Supabase (service role).
 *
 *   npm run importar -- --dry-run                 # simula, não grava
 *   npm run importar -- --dir C:\caminho\planilhas
 *   npm run importar -- --empresa-pagar TDTS      # empresa padrão das contas a pagar
 *
 * Gera relatório de inconsistências em scripts/importacao/relatorios/*.csv
 */
import "dotenv/config";
import { config as carregarEnv } from "dotenv";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { calcularDias, calcularValorMedicao } from "../../src/lib/calculos/medicao";
import { descricaoBase } from "../../src/lib/calculos/parcelas";
import { lerPlanilha, type Aba, type LinhaPlanilha } from "./leitor";
import * as N from "./normalizar";

carregarEnv({ path: ".env.local" });

// o projeto é ESM ("type": "module"): não existe __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- CLI
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opcao = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("dry-run");
const DIR = path.resolve(opcao("dir") ?? path.join(__dirname, "planilhas"));
const EMPRESA_PAGAR = (opcao("empresa-pagar") ?? "OLIVEIRA").toUpperCase();

type Sb = SupabaseClient<Database>;

// ---------------------------------------------------------------- relatório
interface Ocorrencia { arquivo: string; aba: string; linha: number | ""; tipo: "erro" | "aviso" | "ignorado"; mensagem: string }
const ocorrencias: Ocorrencia[] = [];
const contagem: Record<string, number> = {};
const conta = (k: string, n = 1) => (contagem[k] = (contagem[k] ?? 0) + n);
let arquivoAtual = "";
function registrar(l: LinhaPlanilha | null, tipo: Ocorrencia["tipo"], mensagem: string) {
  ocorrencias.push({ arquivo: arquivoAtual, aba: l?.aba ?? "", linha: l?.linha ?? "", tipo, mensagem });
}

// ---------------------------------------------------------------- repositório (respeita --dry-run)
class Repo {
  empresas = new Map<string, string>(); // apelido → id
  clientes = new Map<string, string>(); // chave(nome) → id
  obras = new Map<string, string>(); // clienteId|chave(obra) → id
  locadores = new Map<string, string>();
  veiculos = new Map<string, { id: string; proprietario: string; empresa_id: string }>();
  contratos = new Map<string, { id: string; valor_mensal: number; dia_corte: 1 | 21; data_inicio: string; prazo: number }>(); // veiculoId → ativo
  contatos = new Set<string>();
  contas = new Map<string, string>(); // empresaId|banco → id
  fornecedores = new Map<string, string>();
  medicoes = new Map<string, string>(); // contratoId|inicio → id
  medicoesPorNF = new Map<string, string>();
  contasPagar = new Set<string>(); // descricao|vencimento|valor
  grupos = new Map<string, string>();

  constructor(private sb: Sb) {}

  async carregar() {
    const t = async <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data ?? []; };
    for (const e of await t(this.sb.from("empresas").select("id, apelido"))) this.empresas.set(e.apelido, e.id);
    for (const c of await t(this.sb.from("clientes").select("id, razao_social, nome_fantasia"))) {
      this.clientes.set(N.chave(c.nome_fantasia ?? c.razao_social), c.id);
      this.clientes.set(N.chave(c.razao_social), c.id);
    }
    for (const o of await t(this.sb.from("obras").select("id, cliente_id, nome, codigo"))) {
      this.obras.set(`${o.cliente_id}|${N.chave(o.nome)}`, o.id);
      if (o.codigo) this.obras.set(`${o.cliente_id}|${N.chave(o.codigo)}`, o.id);
    }
    for (const l of await t(this.sb.from("locadores").select("id, nome"))) this.locadores.set(N.chave(l.nome), l.id);
    for (const v of await t(this.sb.from("veiculos").select("id, placa, proprietario, empresa_id"))) this.veiculos.set(v.placa, v);
    for (const c of await t(this.sb.from("contratos").select("id, veiculo_id, valor_mensal, dia_corte_inicio, data_inicio, prazo_pagamento_dias").eq("status", "ativo")))
      this.contratos.set(c.veiculo_id, { id: c.id, valor_mensal: c.valor_mensal, dia_corte: c.dia_corte_inicio as 1 | 21, data_inicio: c.data_inicio, prazo: c.prazo_pagamento_dias });
    for (const c of await t(this.sb.from("contatos").select("cliente_id, email, whatsapp"))) this.contatos.add(`${c.cliente_id}|${c.email ?? ""}|${c.whatsapp ?? ""}`);
    for (const c of await t(this.sb.from("contas_bancarias").select("id, empresa_id, banco"))) this.contas.set(`${c.empresa_id}|${c.banco}`, c.id);
    for (const f of await t(this.sb.from("fornecedores").select("id, nome"))) this.fornecedores.set(N.chave(f.nome), f.id);
    for (const m of await t(this.sb.from("medicoes").select("id, contrato_id, periodo_inicio, numero_nf").neq("status", "cancelado"))) {
      this.medicoes.set(`${m.contrato_id}|${m.periodo_inicio}`, m.id);
      if (m.numero_nf) this.medicoesPorNF.set(m.numero_nf, m.id);
    }
    for (const c of await t(this.sb.from("contas_pagar").select("descricao, vencimento, valor").gte("vencimento", N.DATA_CORTE)))
      this.contasPagar.add(`${N.chave(c.descricao)}|${c.vencimento}|${c.valor}`);
  }

  /** insert que devolve id (em dry-run, gera um uuid local) */
  async inserir<T extends keyof Database["public"]["Tables"]>(tabela: T, linha: Database["public"]["Tables"][T]["Insert"]): Promise<string> {
    conta(`inserir ${tabela}`);
    if (DRY) return randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.sb.from(tabela) as any).insert(linha).select("id").single();
    if (error) throw error;
    return (data as unknown as { id: string }).id;
  }

  async atualizar<T extends keyof Database["public"]["Tables"]>(tabela: T, id: string, valores: Database["public"]["Tables"][T]["Update"]) {
    conta(`atualizar ${tabela}`);
    if (DRY) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.sb.from(tabela) as any).update(valores).eq("id", id);
    if (error) throw error;
  }

  empresa(v: unknown): string {
    const k = N.chave(v);
    const ap = /tdts/.test(k) ? "TDTS" : !k || /oliveira/.test(k) ? "OLIVEIRA" : k.toUpperCase();
    const id = this.empresas.get(ap);
    if (!id) throw new Error(`Empresa "${ap}" não cadastrada — cadastre em Cadastros → Empresas e importe de novo`);
    return id;
  }

  async cliente(nome: string, l: LinhaPlanilha): Promise<string> {
    const k = N.chave(nome);
    let id = this.clientes.get(k);
    if (!id) {
      id = await this.inserir("clientes", { razao_social: nome, nome_fantasia: nome, observacoes: `Importado de ${arquivoAtual}` });
      this.clientes.set(k, id);
      registrar(l, "aviso", `Cliente criado: "${nome}" (revise razão social/CNPJ)`);
    }
    return id;
  }

  async obra(clienteId: string, nome: string | null): Promise<string | null> {
    if (!nome) return null;
    const k = `${clienteId}|${N.chave(nome)}`;
    let id = this.obras.get(k);
    if (!id) {
      id = await this.inserir("obras", { cliente_id: clienteId, nome: `Obra ${nome}`, codigo: nome });
      this.obras.set(k, id);
    }
    return id;
  }

  async locador(nome: string, extra: Partial<Database["public"]["Tables"]["locadores"]["Insert"]> = {}): Promise<string> {
    const k = N.chave(nome);
    let id = this.locadores.get(k);
    if (!id) {
      id = await this.inserir("locadores", { nome, ...extra });
      this.locadores.set(k, id);
    } else if (Object.values(extra).some(Boolean)) {
      await this.atualizar("locadores", id, extra);
    }
    return id;
  }

  async veiculo(placa: string, empresaId: string, locadorId: string | null, l: LinhaPlanilha) {
    let v = this.veiculos.get(placa);
    if (!v) {
      const id = await this.inserir("veiculos", {
        placa, empresa_id: empresaId, proprietario: locadorId ? "locador" : "proprio", locador_id: locadorId, tipo: "caminhao",
        observacoes: `Importado de ${arquivoAtual} — revisar tipo/modelo`,
      });
      v = { id, proprietario: locadorId ? "locador" : "proprio", empresa_id: empresaId };
      this.veiculos.set(placa, v);
      registrar(l, "aviso", `Veículo criado: ${placa} (tipo "caminhão" por padrão — revisar)`);
    } else if (locadorId && v.proprietario !== "locador") {
      await this.atualizar("veiculos", v.id, { proprietario: "locador", locador_id: locadorId });
      v.proprietario = "locador";
    }
    return v;
  }

  async contaBancaria(empresaId: string, banco: string | null) {
    if (!banco) return null;
    const k = `${empresaId}|${banco}`;
    let id = this.contas.get(k) ?? null;
    if (!id) {
      id = await this.inserir("contas_bancarias", { empresa_id: empresaId, banco: banco as "Bradesco", apelido: banco });
      this.contas.set(k, id);
    }
    return id;
  }
}

// ---------------------------------------------------------------- arquivos
function acharArquivo(padrao: RegExp): string | null {
  if (!existsSync(DIR)) return null;
  const f = readdirSync(DIR).find((n) => padrao.test(n) && /\.xlsx?$/i.test(n) && !n.startsWith("~$"));
  return f ? path.join(DIR, f) : null;
}

// BASE: placa → valores do contrato e locador
type Base = { locador: string | null; valor_mensal: number | null; repasse: number | null };
async function importarBase(repo: Repo, abas: Aba[]): Promise<Map<string, Base>> {
  const base = new Map<string, Base>();
  const aba = abas.find((a) => /base/i.test(a.nome));
  if (!aba) { registrar(null, "aviso", "Aba BASE não encontrada"); return base; }
  for (const l of aba.linhas) {
    const placa = N.placa(l.get("placa"));
    const locador = N.texto(l.get("comodante", "locador"));
    if (locador) {
      const contato = N.contato(l.get("contato"));
      const pix = N.texto(l.get("c/c pix", "pix", "c c pix"));
      await repo.locador(locador, {
        telefone: contato.whatsapp?.replace(/^55/, "") ?? null, chave_pix: pix, nome_titular_pix: N.texto(l.get("nome pix", "titular")),
        tipo_chave_pix: pix ? (/@/.test(pix) ? "email" : pix.replace(/\D/g, "").length === 14 ? "cnpj" : pix.replace(/\D/g, "").length === 11 ? "cpf" : null) : null,
      });
      conta("locadores (BASE)");
    }
    if (!placa) { if (l.get("placa")) registrar(l, "ignorado", `Placa inválida: ${l.get("placa")}`); continue; }
    base.set(placa, {
      locador,
      valor_mensal: N.valor(l.get("valor locacao c/ empresa", "valor locacao", "valor mensal")),
      repasse: N.valor(l.get("pagamento locatario", "pagamento locador", "repasse")),
    });
  }
  return base;
}

/** Lembrete de faturamento: clientes, obras, veículos, contratos, medições, contatos */
async function importarLembrete(repo: Repo, abas: Aba[], base: Map<string, Base>) {
  for (const aba of abas) {
    const comp = N.competenciaAba(aba.nome);
    if (!comp) { registrar(null, "ignorado", `Aba "${aba.nome}" sem competência no nome`); continue; }
    if (`${comp}-01` < N.DATA_CORTE) { conta("abas antes de jan/2026 (ignoradas)"); continue; }
    const sublocado = /sub/i.test(aba.nome);
    for (const l of aba.linhas) {
      try {
        const placa = N.placa(l.get("placa"));
        if (!placa) { if (N.texto(l.get("placa"))) registrar(l, "ignorado", `Placa inválida: ${l.get("placa")}`); continue; }
        const empresaId = repo.empresa(l.get("empresa"));
        const b = base.get(placa);
        const colCliente = N.texto(l.get("cliente"));
        const locadorNome = sublocado ? (colCliente ?? b?.locador ?? null) : null;
        const clienteTxt = sublocado ? N.texto(l.get("contrato", "obra", "tomador")) : colCliente;
        const co = N.clienteObra(clienteTxt);
        if (!co || /^\d+$/.test(co.cliente)) { registrar(l, "erro", `Cliente não identificado (${clienteTxt ?? "vazio"})`); continue; }
        if (sublocado && !locadorNome) { registrar(l, "erro", "Sublocado sem locador"); continue; }

        const clienteId = await repo.cliente(co.cliente, l);
        const obraId = await repo.obra(clienteId, co.obra);
        const locadorId = locadorNome ? await repo.locador(locadorNome) : null;
        const veiculo = await repo.veiculo(placa, empresaId, locadorId, l);

        const per = N.periodo(l.get("periodo"), comp);
        if (!per) { registrar(l, "erro", `Período inválido: ${l.get("periodo")}`); continue; }
        if (per.fim < N.DATA_CORTE) continue;
        const diaCorte: 1 | 21 = Number(per.inicio.slice(8)) >= 15 ? 21 : 1;
        const valorPlanilha = N.valor(l.get("valor"));
        // planilha "Valor Repasse": coluna Repasse ao lado do Valor
        const repassePlanilha = sublocado ? N.valor(l.get("repasse")) : null;
        const repasseMensal = b?.repasse ?? repassePlanilha;

        let contrato = repo.contratos.get(veiculo.id);
        if (!contrato) {
          const valorMensal = b?.valor_mensal ?? valorPlanilha;
          if (!valorMensal) { registrar(l, "erro", "Sem valor mensal (BASE nem coluna Valor)"); continue; }
          const numero = sublocado ? null : N.texto(l.get("contrato"));
          const id = await repo.inserir("contratos", {
            empresa_id: empresaId, cliente_id: clienteId, obra_id: obraId, veiculo_id: veiculo.id, numero,
            valor_mensal: valorMensal, valor_repasse_mensal: veiculo.proprietario === "locador" ? repasseMensal : null,
            dia_corte_inicio: diaCorte, prazo_pagamento_dias: 30, data_inicio: per.inicio, status: "ativo",
            observacoes: "Importado — confirme prazo de pagamento e data de mobilização",
          });
          contrato = { id, valor_mensal: valorMensal, dia_corte: diaCorte, data_inicio: per.inicio, prazo: 30 };
          repo.contratos.set(veiculo.id, contrato);
          if (veiculo.proprietario === "locador" && !repasseMensal) registrar(l, "aviso", `${placa}: sublocado sem valor de repasse (BASE nem coluna Repasse)`);
        }

        // contato de faturamento
        const ct = N.contato(l.get("responsavel"));
        if (ct.email || ct.whatsapp) {
          const k = `${clienteId}|${ct.email ?? ""}|${ct.whatsapp ?? ""}`;
          if (!repo.contatos.has(k)) {
            await repo.inserir("contatos", { cliente_id: clienteId, obra_id: obraId, nome: ct.nome ?? ct.email ?? "Faturamento", email: ct.email, whatsapp: ct.whatsapp, recebe_fatura: true });
            repo.contatos.add(k);
          }
        }

        // medição
        const chaveMed = `${contrato.id}|${per.inicio}`;
        if (repo.medicoes.has(chaveMed)) { conta("medições já existentes"); continue; }
        const dias = calcularDias({ periodo: per, dataInicioContrato: contrato.data_inicio <= per.inicio ? per.inicio : contrato.data_inicio });
        const { valorFinal } = calcularValorMedicao({ valorMensal: contrato.valor_mensal, dias });
        let acrescimos = 0, descontos = 0;
        if (valorPlanilha !== null && Math.abs(valorPlanilha - valorFinal) >= 0.01) {
          if (valorPlanilha > valorFinal) acrescimos = Math.round((valorPlanilha - valorFinal) * 100) / 100;
          else descontos = Math.round((valorFinal - valorPlanilha) * 100) / 100;
          if (Math.abs(valorPlanilha - valorFinal) > 1) registrar(l, "aviso", `${placa} ${per.inicio}: valor da planilha ${valorPlanilha} ≠ calculado ${valorFinal} (ajustado em ${acrescimos ? "acréscimos" : "descontos"})`);
        }
        const obsNF = N.nfDasObservacoes(l.get("observacoes", "obs"));
        const obs = obsNF.resto;
        const nf = obsNF.nf ?? N.texto(l.get("nf", "nota"));
        let status = N.statusMedicao(l.get("status"));
        let emissao = N.data(l.get("faturado", "faturar", "emissao"));
        const vencimento = N.data(l.get("vencimento"));
        if (status !== "a_faturar" && !emissao) { emissao = vencimento ? null : per.fim; registrar(l, "aviso", `${placa}: faturada sem data de emissão`); }
        if (status !== "a_faturar" && !emissao && !vencimento) status = "a_faturar";
        const id = await repo.inserir("medicoes", {
          contrato_id: contrato.id, empresa_id: empresaId, periodo_inicio: per.inicio, periodo_fim: per.fim, dias, valor_mensal: contrato.valor_mensal,
          acrescimos, descontos, numero_nf: nf, data_emissao: emissao ?? (vencimento && status !== "a_faturar" ? per.fim : null), data_vencimento: vencimento,
          status: status === "recebido" || status === "recebido_parcial" ? "faturado" : status, observacoes: obs,
        });
        repo.medicoes.set(chaveMed, id);
        if (nf) repo.medicoesPorNF.set(nf, id);
        // o repasse é gerado pelo banco (repasse mensal × dias ÷ 30): avisa quando não bate com a planilha (período parcial)
        if (repassePlanilha !== null && repasseMensal !== null) {
          const calc = calcularValorMedicao({ valorMensal: repasseMensal, dias }).valorBase;
          if (Math.abs(calc - repassePlanilha) > 1) registrar(l, "aviso", `${placa} ${per.inicio}: repasse da planilha ${repassePlanilha} ≠ calculado ${calc} (${dias} dias) — ajuste em Repasses`);
        }
        if (status === "recebido" && valorPlanilha) {
          await repo.inserir("recebimentos", { medicao_id: id, data: vencimento ?? per.fim, valor: valorPlanilha, observacoes: "Importado (data estimada = vencimento)" });
        }
        conta("medições (lembrete)");
      } catch (e) {
        registrar(l, "erro", (e as Error).message);
      }
    }
  }
}

/** Abas por cliente do FATURAMENTO: NF, emissão, descontos e recebimentos das medições */
async function importarHistorico(repo: Repo, sb: Sb, abas: Aba[]) {
  for (const aba of abas.filter((a) => !/base/i.test(a.nome))) {
    for (const l of aba.linhas) {
      const nf = N.texto(l.get("fatura", "nf"));
      const per = N.periodo(l.get("periodo medicao", "periodo"));
      if (!nf && !per) continue;
      if (per && per.fim < N.DATA_CORTE) continue;
      let id = nf ? repo.medicoesPorNF.get(nf) : undefined;
      if (!id && per) {
        const placa = N.placa(l.get("placa"));
        const v = placa ? repo.veiculos.get(placa) : undefined;
        const c = v ? repo.contratos.get(v.id) : undefined;
        id = c ? repo.medicoes.get(`${c.id}|${per.inicio}`) : undefined;
      }
      if (!id) { registrar(l, "aviso", `Medição não encontrada (NF ${nf ?? "—"}, período ${l.get("periodo medicao", "periodo") ?? "—"})`); continue; }
      const emissao = N.data(l.get("emissao"));
      const descontos = N.valor(l.get("descontos", "desconto"));
      const recebidoEm = N.data(l.get("recebido em", "recebido"));
      const valorFatura = N.valor(l.get("valor fatura", "valor"));
      const upd: Database["public"]["Tables"]["medicoes"]["Update"] = {};
      if (nf) upd.numero_nf = nf;
      if (emissao) { upd.data_emissao = emissao; upd.status = "faturado"; }
      if (descontos) upd.descontos = descontos;
      if (Object.keys(upd).length) await repo.atualizar("medicoes", id, upd);
      if (recebidoEm && valorFatura && !DRY) {
        const { count } = await sb.from("recebimentos").select("id", { count: "exact", head: true }).eq("medicao_id", id);
        if (!count) await repo.inserir("recebimentos", { medicao_id: id, data: recebidoEm, valor: valorFatura, observacoes: "Importado do FATURAMENTO" });
      } else if (recebidoEm && valorFatura) conta("inserir recebimentos");
      conta("medições históricas atualizadas");
    }
  }
}

/** Pagamentos Fornecedores (CAIXA): repasses pagos */
async function importarRepasses(repo: Repo, sb: Sb, abas: Aba[]) {
  for (const aba of abas) {
    for (const l of aba.linhas) {
      const placa = N.placa(l.get("placa"));
      const nf = N.texto(l.get("fatura", "nf"));
      const pagoEm = N.data(l.get("pago em"));
      if (!placa || (!nf && !pagoEm)) continue;
      const emissao = N.data(l.get("emissao"));
      if (emissao && emissao < N.DATA_CORTE) continue;
      const medId = nf ? repo.medicoesPorNF.get(nf) : undefined;
      if (!medId) { registrar(l, "aviso", `Repasse ${placa}: medição da NF ${nf ?? "—"} não encontrada`); continue; }
      if (DRY) { conta("repasses a marcar como pagos"); continue; }
      const { data: rp } = await sb.from("repasses").select("id, status, valor_liquido").eq("medicao_id", medId).neq("status", "cancelado").maybeSingle();
      if (!rp) { registrar(l, "aviso", `Medição NF ${nf} sem repasse (veículo próprio ou sem valor de repasse)`); continue; }
      const pagoPlanilha = N.valor(l.get("pag fornc", "pag forn", "pagamento"));
      if (pagoPlanilha !== null && Math.abs(pagoPlanilha - rp.valor_liquido) > 1) registrar(l, "aviso", `Repasse NF ${nf}: planilha ${pagoPlanilha} ≠ sistema ${rp.valor_liquido}`);
      if (pagoEm && rp.status !== "pago") {
        const { error } = await sb.rpc("fn_pagar_repasse", { p_repasse: rp.id, p_data: pagoEm, p_confirmar_adiantado: true });
        if (error) registrar(l, "erro", `Pagar repasse NF ${nf}: ${error.message}`);
        else conta("repasses marcados como pagos");
      }
    }
  }
}

/** Contas a pagar (abas mensais) */
async function importarContasPagar(repo: Repo, abas: Aba[]) {
  const empresaPadrao = repo.empresa(EMPRESA_PAGAR);
  for (const aba of abas) {
    const comp = N.competenciaAba(aba.nome);
    if (!comp) { registrar(null, "ignorado", `Aba "${aba.nome}" sem mês no nome`); continue; }
    for (const l of aba.linhas) {
      try {
        const descricao = N.texto(l.get("descricao"));
        const vencimento = N.data(l.get("vencimento"));
        const valor = N.valor(l.get("custo real", "valor"));
        if (!descricao || /^total/i.test(descricao)) continue;
        if (!vencimento || valor === null) { registrar(l, "erro", `"${descricao}": vencimento/valor inválidos (${l.get("vencimento")} / ${l.get("custo real", "valor")})`); continue; }
        if (vencimento < N.DATA_CORTE) continue;
        const k = `${N.chave(descricao)}|${vencimento}|${valor}`;
        if (repo.contasPagar.has(k)) { conta("contas já existentes"); continue; }
        const empresaId = l.get("empresa") ? repo.empresa(l.get("empresa")) : empresaPadrao;
        const placa = N.placa(l.get("placa"));
        const veiculo = placa ? repo.veiculos.get(placa) : undefined;
        if (placa && !veiculo) registrar(l, "aviso", `"${descricao}": placa ${placa} não cadastrada — lançada como fixa`);
        let tipo: "fixa" | "veiculo" = /veic/.test(N.chave(l.get("lancamentos", "lancamento", "tipo"))) || !!veiculo ? "veiculo" : "fixa";
        if (tipo === "veiculo" && !veiculo) { tipo = "fixa"; registrar(l, "aviso", `"${descricao}": despesa de veículo sem placa válida — lançada como fixa`); }
        const obs = N.texto(l.get("observacao", "obs"));
        const parc = N.parcela(obs) ?? N.parcela(descricao);
        const { forma, banco } = N.formaBanco(l.get("cartao/boleto", "cartao", "forma", "banco"));
        const descontar = tipo === "veiculo" && veiculo?.proprietario === "locador" && N.simNao(l.get("descontar"));
        let grupo: string | null = null;
        if (parc) {
          const gk = `${N.chave(descricaoBase(descricao))}|${parc.total}`;
          grupo = repo.grupos.get(gk) ?? randomUUID();
          repo.grupos.set(gk, grupo);
        }
        const pago = N.simNao(l.get("pago"));
        await repo.inserir("contas_pagar", {
          empresa_id: empresaId, descricao: parc && !/\d+\s*\/\s*\d+/.test(descricao) ? `${descricao} ${parc.num}/${parc.total}` : descricao,
          tipo, veiculo_id: tipo === "veiculo" ? veiculo!.id : null, vencimento, valor,
          parcela_num: parc?.num ?? null, parcela_total: parc?.total ?? null, grupo_parcela_id: grupo,
          forma_pagamento: forma, conta_bancaria_id: await repo.contaBancaria(empresaId, banco), descontar_locador: descontar,
          pago_em: pago ? vencimento : null, valor_pago: pago ? valor : null, observacoes: obs && !parc ? obs : null,
        });
        repo.contasPagar.add(k);
        conta("contas a pagar");
      } catch (e) {
        registrar(l, "erro", (e as Error).message);
      }
    }
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
  console.log(`${DRY ? "SIMULAÇÃO (--dry-run)" : "IMPORTAÇÃO"} · pasta ${DIR}`);
  const repo = new Repo(sb);
  await repo.carregar();

  const arqFat = acharArquivo(/faturamento/i);
  const arqLembrete = acharArquivo(/lembrete|valor\s*repasse/i);
  const arqCaixa = acharArquivo(/pagamentos?.*fornecedor|caixa/i);
  const arqPagar = acharArquivo(/contas\s*a\s*pagar/i);

  let base = new Map<string, Base>();
  let abasFat: Aba[] = [];
  if (arqFat) {
    arquivoAtual = path.basename(arqFat);
    abasFat = lerPlanilha(arqFat, ["placa", "comodante", "contato", "pix", "valor locacao", "pagamento locatario", "fatura", "periodo medicao", "emissao", "dias", "recebido em"]);
    base = await importarBase(repo, abasFat);
  } else registrar(null, "aviso", "FATURAMENTO OLIVEIRAeOLIVEIRA.xlsx não encontrado");

  if (arqLembrete) {
    arquivoAtual = path.basename(arqLembrete);
    await importarLembrete(repo, lerPlanilha(arqLembrete, ["empresa", "contrato", "placa", "cliente", "periodo", "faturar", "faturado", "vencimento", "valor", "repasse", "responsavel", "status", "observacoes"]), base);
  } else registrar(null, "aviso", "Planilha de lembrete de faturamento (ou Valor Repasse) não encontrada");

  if (arqFat) { arquivoAtual = path.basename(arqFat); await importarHistorico(repo, sb, abasFat); }

  if (arqCaixa) {
    arquivoAtual = path.basename(arqCaixa);
    await importarRepasses(repo, sb, lerPlanilha(arqCaixa, ["locador", "locadora", "placa", "empresa", "fatura", "emissao", "recebido em", "valor fatura", "dias", "pag fornc", "pago em"]));
  } else registrar(null, "aviso", "Pagamentos Fornecedores - CAIXA.xlsx não encontrado");

  if (arqPagar) {
    arquivoAtual = path.basename(arqPagar);
    await importarContasPagar(repo, lerPlanilha(arqPagar, ["descricao", "vencimento", "custo real", "placa", "pago", "observacao", "cartao", "boleto", "descontar", "lancamentos"]));
  } else registrar(null, "aviso", "Contas a pagar 202x.xlsx não encontrado");

  // relatório
  const dirRel = path.join(__dirname, "relatorios");
  mkdirSync(dirRel, { recursive: true });
  const arq = path.join(dirRel, `inconsistencias_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}${DRY ? "_dry-run" : ""}.csv`);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeFileSync(arq, "\ufeff" + ["arquivo;aba;linha;tipo;mensagem", ...ocorrencias.map((o) => [o.arquivo, o.aba, o.linha, o.tipo, o.mensagem].map(esc).join(";"))].join("\r\n"));
  console.table(contagem);
  const porTipo = ocorrencias.reduce<Record<string, number>>((a, o) => ((a[o.tipo] = (a[o.tipo] ?? 0) + 1), a), {});
  console.log(`Ocorrências: ${JSON.stringify(porTipo)} → ${path.relative(process.cwd(), arq)}`);
  if (!DRY) console.log("Concluído. Rode as rotinas em Configurações → Rotinas para gerar alertas e recorrências.");
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
