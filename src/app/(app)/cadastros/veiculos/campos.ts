import type { Campo } from "@/components/app/formulario";
import type { Opcao } from "@/components/ui/select";
import { opcoesDe, ROTULOS, type VeiculoForm } from "@/lib/schemas/cadastros";

export const STATUS_VEICULO: Opcao[] = [
  { value: "disponivel", label: "Disponível" }, { value: "locado", label: "Locado" }, { value: "manutencao", label: "Manutenção" },
  { value: "parado", label: "Parado" }, { value: "vendido", label: "Vendido" },
];

export function camposVeiculo(empresas: Opcao[], locadores: Opcao[]): Campo<VeiculoForm>[] {
  return [
    { nome: "placa", rotulo: "Placa", tipo: "placa", obrigatorio: true, col: 2, ajuda: "Mercosul ou antiga" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoVeiculo), col: 2 },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_VEICULO, col: 2 },
    { nome: "marca", rotulo: "Marca", col: 2 },
    { nome: "modelo", rotulo: "Modelo", col: 2, ajuda: "Planos por modelo usam este nome" },
    { nome: "ano", rotulo: "Ano", tipo: "numero", col: 2 },
    { nome: "renavam", rotulo: "RENAVAM", col: 2, ajuda: "Usado na consulta de multas" },
    { nome: "chassi", rotulo: "Chassi", col: 2, ajuda: "Sai no contrato" },
    { nome: "cor", rotulo: "Cor", col: 2 },
    { nome: "empresa_id", rotulo: "Empresa", tipo: "select", opcoes: empresas, obrigatorio: true, col: 2 },
    { nome: "proprietario", rotulo: "Propriedade", tipo: "select", opcoes: opcoesDe(ROTULOS.proprietario), col: 2 },
    { nome: "locador_id", rotulo: "Locador", tipo: "select", opcoes: locadores, vazio: "—", col: 2, visivel: (v) => v.proprietario === "locador", obrigatorio: true },
    { nome: "km_atual", rotulo: "Km atual", tipo: "numero", col: 2 },
    { nome: "horimetro_atual", rotulo: "Horímetro atual", tipo: "decimal", col: 2 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
}
