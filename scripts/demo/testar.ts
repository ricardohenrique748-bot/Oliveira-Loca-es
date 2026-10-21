import { createClient } from "@supabase/supabase-js";
import { criarBanco } from "../db/pglite";
import { PostgrestDemo } from "../../src/demo/postgrest";

const db = await criarBanco({ seed: true });
const rest = new PostgrestDemo(db, () => "aaaaaaaa-0000-0000-0000-000000000001");
await rest.carregarCatalogo();
const sb = createClient("https://demo.local", "demo", {
  accessToken: async () => "demo",
  global: { fetch: async (e: RequestInfo | URL, i?: RequestInit) => { const r = new Request(e, i); return rest.atender(r.method, new URL(r.url), r.headers, r.method === "GET" || r.method === "HEAD" ? null : await r.text()); } },
});
const mostrar = (n: string, r: { data: unknown; error: unknown; count?: number | null }) =>
  console.log(n, r.error ? "ERRO " + JSON.stringify(r.error) : JSON.stringify(r.data).slice(0, 160), r.count != null ? `count=${r.count}` : "");

mostrar("perfil", await sb.from("usuarios_perfil").select("nome, perfil, ativo").eq("user_id", "aaaaaaaa-0000-0000-0000-000000000001").maybeSingle());
mostrar("empresas", await sb.from("empresas").select("id, apelido, razao_social").eq("ativo", true).order("apelido"));
mostrar("contratos", await sb.from("contratos").select("id, numero, status, valor_mensal, clientes(razao_social, nome_fantasia), obras(nome), veiculos(placa), empresas(apelido)", { count: "exact" }).order("numero", { ascending: false }).range(0, 4));
mostrar("inner", await sb.from("recebimentos").select("data, valor, medicoes!inner(empresa_id, contrato_id, contratos!inner(cliente_id, veiculos!inner(placa)))").limit(2));
mostrar("inner-filtro", await sb.from("recebimentos").select("data, valor, medicoes!inner(empresa_id)").eq("medicoes.empresa_id", "11111111-0000-0000-0000-000000000002").limit(2));
mostrar("locadores 1:N", await sb.from("locadores").select("id, nome, veiculos(placa)").limit(2));
mostrar("or", await sb.from("veiculos").select("id, placa").or("placa.ilike.%A%,modelo.ilike.%x%").limit(3));
mostrar("not in", await sb.from("ordens_servico").select("id, status").not("status", "in", "(fechada,cancelada)").limit(3));
mostrar("medicoes_v", await sb.from("medicoes_v").select("id, placa, cliente_fantasia, status_exibicao").gte("periodo_fim", "2026-08-01").limit(2));
mostrar("head count", await sb.from("veiculos").select("id", { count: "exact", head: true }));
mostrar("single", await sb.from("veiculos").select("id, placa").limit(1).single());
mostrar("vw_aging", await sb.from("vw_aging_receber").select("faixa, saldo").limit(3));
const ins = await sb.from("clientes").insert({ razao_social: "Cliente Demo Ltda", nome_fantasia: "Demo", cpf_cnpj: "11.222.333/0001-81" }).select("id").single();
mostrar("insert", ins);
if (ins.data) {
  mostrar("update", await sb.from("clientes").update({ nome_fantasia: "Demo 2" }).eq("id", (ins.data as { id: string }).id).select("id, nome_fantasia").single());
  mostrar("delete", await sb.from("clientes").delete({ count: "exact" }).eq("id", (ins.data as { id: string }).id));
}
mostrar("rpc", await sb.rpc("fn_rodar_jobs" as never));
