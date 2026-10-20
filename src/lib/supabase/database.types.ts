// Gerado por scripts/db/gen-types.ts — não editar à mão.
// Com o Supabase local rodando, regenere com: npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      alertas: {
        Row: {
          created_at: string
          created_by: string | null
          data_ref: string
          descricao: string | null
          empresa_id: string | null
          id: string
          lida: boolean
          link: string | null
          referencia_id: string
          referencia_tabela: string
          severidade: Database["public"]["Enums"]["severidade_alerta"]
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_ref?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          referencia_id: string
          referencia_tabela: string
          severidade?: Database["public"]["Enums"]["severidade_alerta"]
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_ref?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          referencia_id?: string
          referencia_tabela?: string
          severidade?: Database["public"]["Enums"]["severidade_alerta"]
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: Database["public"]["Enums"]["acao_auditoria"]
          antes: Json | null
          criado_em: string
          depois: Json | null
          id: number
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_auditoria"]
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          id?: number
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_auditoria"]
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          id?: number
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      boletos: {
        Row: {
          ambiente: string
          codigo_barras: string | null
          conta_bancaria_id: string
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_vencimento: string
          empresa_id: string
          id: string
          linha_digitavel: string
          medicao_id: string
          nosso_numero: string
          pix_copia_cola: string | null
          recebimento_id: string | null
          seu_numero: string
          status: string
          txid: string | null
          updated_at: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          ambiente: string
          codigo_barras?: string | null
          conta_bancaria_id: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          empresa_id: string
          id?: string
          linha_digitavel: string
          medicao_id: string
          nosso_numero: string
          pix_copia_cola?: string | null
          recebimento_id?: string | null
          seu_numero: string
          status?: string
          txid?: string | null
          updated_at?: string
          valor: number
          valor_pago?: number | null
        }
        Update: {
          ambiente?: string
          codigo_barras?: string | null
          conta_bancaria_id?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          empresa_id?: string
          id?: string
          linha_digitavel?: string
          medicao_id?: string
          nosso_numero?: string
          pix_copia_cola?: string | null
          recebimento_id?: string | null
          seu_numero?: string
          status?: string
          txid?: string | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "boletos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_recebimento_id_fkey"
            columns: ["recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_despesa: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_despesa"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          uf: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          uf?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          uf?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          created_at: string
          created_by: string | null
          descricao: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          apelido: string
          ativo: boolean
          banco: Database["public"]["Enums"]["banco"]
          codigo_beneficiario: string | null
          conta: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          posto: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          apelido: string
          ativo?: boolean
          banco: Database["public"]["Enums"]["banco"]
          codigo_beneficiario?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          posto?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          apelido?: string
          ativo?: boolean
          banco?: Database["public"]["Enums"]["banco"]
          codigo_beneficiario?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          posto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          anexo_url: string | null
          categoria_id: string | null
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          descontar_locador: boolean
          descricao: string
          empresa_id: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          fornecedor_id: string | null
          grupo_parcela_id: string | null
          id: string
          observacoes: string | null
          ordem_servico_id: string | null
          pago_em: string | null
          parcela_num: number | null
          parcela_total: number | null
          recorrente: boolean
          repasse_id: string | null
          tipo: Database["public"]["Enums"]["tipo_despesa"]
          updated_at: string
          valor: number
          valor_pago: number | null
          veiculo_id: string | null
          vencimento: string
        }
        Insert: {
          anexo_url?: string | null
          categoria_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          descontar_locador?: boolean
          descricao: string
          empresa_id: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          fornecedor_id?: string | null
          grupo_parcela_id?: string | null
          id?: string
          observacoes?: string | null
          ordem_servico_id?: string | null
          pago_em?: string | null
          parcela_num?: number | null
          parcela_total?: number | null
          recorrente?: boolean
          repasse_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
          valor: number
          valor_pago?: number | null
          veiculo_id?: string | null
          vencimento: string
        }
        Update: {
          anexo_url?: string | null
          categoria_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          descontar_locador?: boolean
          descricao?: string
          empresa_id?: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          fornecedor_id?: string | null
          grupo_parcela_id?: string | null
          id?: string
          observacoes?: string | null
          ordem_servico_id?: string | null
          pago_em?: string | null
          parcela_num?: number | null
          parcela_total?: number | null
          recorrente?: boolean
          repasse_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
          valor?: number
          valor_pago?: number | null
          veiculo_id?: string | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_os_fk"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_repasse_id_fkey"
            columns: ["repasse_id"]
            isOneToOne: false
            referencedRelation: "repasses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nome: string
          obra_id: string | null
          recebe_fatura: boolean
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome: string
          obra_id?: string | null
          recebe_fatura?: boolean
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome?: string
          obra_id?: string | null
          recebe_fatura?: boolean
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data_desmobilizacao: string | null
          data_fim: string | null
          data_inicio: string
          dia_corte_inicio: number
          empresa_id: string
          id: string
          numero: string | null
          obra_id: string | null
          observacoes: string | null
          prazo_pagamento_dias: number
          status: Database["public"]["Enums"]["status_contrato"]
          tipo_cobranca: string
          updated_at: string
          valor_mensal: number
          valor_repasse_mensal: number | null
          veiculo_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_desmobilizacao?: string | null
          data_fim?: string | null
          data_inicio: string
          dia_corte_inicio?: number
          empresa_id: string
          id?: string
          numero?: string | null
          obra_id?: string | null
          observacoes?: string | null
          prazo_pagamento_dias?: number
          status?: Database["public"]["Enums"]["status_contrato"]
          tipo_cobranca?: string
          updated_at?: string
          valor_mensal: number
          valor_repasse_mensal?: number | null
          veiculo_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_desmobilizacao?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_corte_inicio?: number
          empresa_id?: string
          id?: string
          numero?: string | null
          obra_id?: string | null
          observacoes?: string | null
          prazo_pagamento_dias?: number
          status?: Database["public"]["Enums"]["status_contrato"]
          tipo_cobranca?: string
          updated_at?: string
          valor_mensal?: number
          valor_repasse_mensal?: number | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_veiculo: {
        Row: {
          anexo_url: string | null
          created_at: string
          created_by: string | null
          id: string
          numero: string | null
          observacoes: string | null
          tipo: Database["public"]["Enums"]["tipo_documento"]
          updated_at: string
          validade: string | null
          veiculo_id: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          tipo: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
          validade?: string | null
          veiculo_id: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
          validade?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          apelido: string
          ativo: boolean
          cidade: string | null
          cnpj: string | null
          contato_nome: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          razao_social: string
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          apelido: string
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          contato_nome?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          razao_social: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          contato_nome?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          razao_social?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          categoria: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leituras: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          horimetro: number | null
          id: string
          km: number | null
          origem: Database["public"]["Enums"]["origem_leitura"]
          updated_at: string
          usuario_id: string | null
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          horimetro?: number | null
          id?: string
          km?: number | null
          origem?: Database["public"]["Enums"]["origem_leitura"]
          updated_at?: string
          usuario_id?: string | null
          veiculo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          horimetro?: number | null
          id?: string
          km?: number | null
          origem?: Database["public"]["Enums"]["origem_leitura"]
          updated_at?: string
          usuario_id?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leituras_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      locadores: {
        Row: {
          ativo: boolean
          banco: string | null
          chave_pix: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          nome_titular_pix: string | null
          observacoes: string | null
          telefone: string | null
          tipo_chave_pix: Database["public"]["Enums"]["tipo_chave_pix"] | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          nome_titular_pix?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_chave_pix?: Database["public"]["Enums"]["tipo_chave_pix"] | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          nome_titular_pix?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_chave_pix?: Database["public"]["Enums"]["tipo_chave_pix"] | null
          updated_at?: string
        }
        Relationships: []
      }
      medicoes: {
        Row: {
          acrescimos: number
          contrato_id: string
          created_at: string
          created_by: string | null
          data_emissao: string | null
          data_vencimento: string | null
          descontos: number
          dias: number
          empresa_id: string
          final: boolean
          id: string
          numero_nf: string | null
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          status: Database["public"]["Enums"]["status_medicao"]
          updated_at: string
          valor_base: number
          valor_final: number
          valor_mensal: number
        }
        Insert: {
          acrescimos?: number
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_vencimento?: string | null
          descontos?: number
          dias: number
          empresa_id: string
          final?: boolean
          id?: string
          numero_nf?: string | null
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          status?: Database["public"]["Enums"]["status_medicao"]
          updated_at?: string
          valor_base?: number
          valor_final?: number
          valor_mensal?: number
        }
        Update: {
          acrescimos?: number
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_vencimento?: string | null
          descontos?: number
          dias?: number
          empresa_id?: string
          final?: boolean
          id?: string
          numero_nf?: string | null
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          status?: Database["public"]["Enums"]["status_medicao"]
          updated_at?: string
          valor_base?: number
          valor_final?: number
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      multas: {
        Row: {
          anexo_url: string | null
          auto_infracao: string | null
          codigo: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_infracao: string
          descricao: string | null
          empresa_id: string
          id: string
          observacoes: string | null
          orgao: string | null
          pago_em: string | null
          pontos: number | null
          responsavel: string
          status: string
          updated_at: string
          valor: number
          veiculo_id: string
          vencimento: string | null
        }
        Insert: {
          anexo_url?: string | null
          auto_infracao?: string | null
          codigo?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_infracao: string
          descricao?: string | null
          empresa_id: string
          id?: string
          observacoes?: string | null
          orgao?: string | null
          pago_em?: string | null
          pontos?: number | null
          responsavel?: string
          status?: string
          updated_at?: string
          valor?: number
          veiculo_id: string
          vencimento?: string | null
        }
        Update: {
          anexo_url?: string | null
          auto_infracao?: string | null
          codigo?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_infracao?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          observacoes?: string | null
          orgao?: string | null
          pago_em?: string | null
          pontos?: number | null
          responsavel?: string
          status?: string
          updated_at?: string
          valor?: number
          veiculo_id?: string
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          ativo: boolean
          cidade: string | null
          cliente_id: string
          codigo: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cliente_id: string
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cliente_id?: string
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          created_at: string
          created_by: string | null
          custo_total: number
          data_abertura: string
          data_fechamento: string | null
          descontar_locador: boolean
          descricao_problema: string
          diagnostico: string | null
          empresa_id: string
          fornecedor_id: string | null
          fotos: string[]
          horas_parado: number
          horimetro: number | null
          id: string
          km: number | null
          numero: number
          parar_veiculo: boolean
          plano_id: string | null
          status: Database["public"]["Enums"]["status_os"]
          status_veiculo_anterior: Database["public"]["Enums"]["status_veiculo"] | null
          tipo: Database["public"]["Enums"]["tipo_os"]
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data_abertura?: string
          data_fechamento?: string | null
          descontar_locador?: boolean
          descricao_problema: string
          diagnostico?: string | null
          empresa_id: string
          fornecedor_id?: string | null
          fotos?: string[]
          horas_parado?: number
          horimetro?: number | null
          id?: string
          km?: number | null
          numero?: number
          parar_veiculo?: boolean
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_os"]
          status_veiculo_anterior?: Database["public"]["Enums"]["status_veiculo"] | null
          tipo?: Database["public"]["Enums"]["tipo_os"]
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data_abertura?: string
          data_fechamento?: string | null
          descontar_locador?: boolean
          descricao_problema?: string
          diagnostico?: string | null
          empresa_id?: string
          fornecedor_id?: string | null
          fotos?: string[]
          horas_parado?: number
          horimetro?: number | null
          id?: string
          km?: number | null
          numero?: number
          parar_veiculo?: boolean
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_os"]
          status_veiculo_anterior?: Database["public"]["Enums"]["status_veiculo"] | null
          tipo?: Database["public"]["Enums"]["tipo_os"]
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      os_itens: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          ordem_servico_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_item_os"]
          updated_at: string
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          ordem_servico_id: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_item_os"]
          updated_at?: string
          valor_total?: never
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          ordem_servico_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_item_os"]
          updated_at?: string
          valor_total?: never
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_itens_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_manutencao: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          intervalo_dias: number | null
          intervalo_horas: number | null
          intervalo_km: number | null
          modelo: string | null
          pct_consumido: number | null
          servico: string
          status_calculado: string | null
          ultima_execucao_data: string | null
          ultima_execucao_horas: number | null
          ultima_execucao_km: number | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          intervalo_dias?: number | null
          intervalo_horas?: number | null
          intervalo_km?: number | null
          modelo?: string | null
          pct_consumido?: number | null
          servico: string
          status_calculado?: string | null
          ultima_execucao_data?: string | null
          ultima_execucao_horas?: number | null
          ultima_execucao_km?: number | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          intervalo_dias?: number | null
          intervalo_horas?: number | null
          intervalo_km?: number | null
          modelo?: string | null
          pct_consumido?: number | null
          servico?: string
          status_calculado?: string | null
          ultima_execucao_data?: string | null
          ultima_execucao_horas?: number | null
          ultima_execucao_km?: number | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_manutencao_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      pneus: {
        Row: {
          created_at: string
          created_by: string | null
          data_compra: string | null
          id: string
          km_instalacao: number | null
          marca: string | null
          medida: string | null
          numero_fogo: string
          observacoes: string | null
          posicao: string | null
          ressolagens: number
          status: string
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          id?: string
          km_instalacao?: number | null
          marca?: string | null
          medida?: string | null
          numero_fogo: string
          observacoes?: string | null
          posicao?: string | null
          ressolagens?: number
          status?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          id?: string
          km_instalacao?: number | null
          marca?: string | null
          medida?: string | null
          numero_fogo?: string
          observacoes?: string | null
          posicao?: string | null
          ressolagens?: number
          status?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pneus_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      pneus_historico: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          evento: string
          id: string
          km: number | null
          observacoes: string | null
          pneu_id: string
          posicao: string | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          evento: string
          id?: string
          km?: number | null
          observacoes?: string | null
          pneu_id: string
          posicao?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          evento?: string
          id?: string
          km?: number | null
          observacoes?: string | null
          pneu_id?: string
          posicao?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pneus_historico_pneu_id_fkey"
            columns: ["pneu_id"]
            isOneToOne: false
            referencedRelation: "pneus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pneus_historico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          cliente_id: string
          condicoes: string | null
          contato_cliente: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_inicio_prevista: string | null
          dia_corte_inicio: number
          empresa_id: string
          equipamento: string | null
          franquia: string | null
          id: string
          jornada: string | null
          km_livre: string | null
          local_operacao: string | null
          modalidade: string
          modelo_documento: string
          motivo_recusa: string | null
          multa_rescisao_pct: number
          numero: string | null
          obra_id: string | null
          observacoes: string | null
          periodo_minimo: string | null
          prazo_pagamento_dias: number
          quantidade: number
          status: string
          tipo_cobranca: string
          updated_at: string
          validade: string | null
          valor: number
          valor_desmobilizacao: number | null
          valor_mobilizacao: number | null
          veiculo_id: string | null
        }
        Insert: {
          cliente_id: string
          condicoes?: string | null
          contato_cliente?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio_prevista?: string | null
          dia_corte_inicio?: number
          empresa_id: string
          equipamento?: string | null
          franquia?: string | null
          id?: string
          jornada?: string | null
          km_livre?: string | null
          local_operacao?: string | null
          modalidade?: string
          modelo_documento?: string
          motivo_recusa?: string | null
          multa_rescisao_pct?: number
          numero?: string | null
          obra_id?: string | null
          observacoes?: string | null
          periodo_minimo?: string | null
          prazo_pagamento_dias?: number
          quantidade?: number
          status?: string
          tipo_cobranca?: string
          updated_at?: string
          validade?: string | null
          valor: number
          valor_desmobilizacao?: number | null
          valor_mobilizacao?: number | null
          veiculo_id?: string | null
        }
        Update: {
          cliente_id?: string
          condicoes?: string | null
          contato_cliente?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio_prevista?: string | null
          dia_corte_inicio?: number
          empresa_id?: string
          equipamento?: string | null
          franquia?: string | null
          id?: string
          jornada?: string | null
          km_livre?: string | null
          local_operacao?: string | null
          modalidade?: string
          modelo_documento?: string
          motivo_recusa?: string | null
          multa_rescisao_pct?: number
          numero?: string | null
          obra_id?: string | null
          observacoes?: string | null
          periodo_minimo?: string | null
          prazo_pagamento_dias?: number
          quantidade?: number
          status?: string
          tipo_cobranca?: string
          updated_at?: string
          validade?: string | null
          valor?: number
          valor_desmobilizacao?: number | null
          valor_mobilizacao?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos: {
        Row: {
          comprovante_url: string | null
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          medicao_id: string
          observacoes: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          comprovante_url?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          medicao_id: string
          observacoes?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          comprovante_url?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          medicao_id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimentos_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      repasse_abatimentos: {
        Row: {
          conta_pagar_id: string | null
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          ordem_servico_id: string | null
          repasse_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          conta_pagar_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          ordem_servico_id?: string | null
          repasse_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          conta_pagar_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          ordem_servico_id?: string | null
          repasse_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "repasse_abatimentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repasse_abatimentos_os_fk"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repasse_abatimentos_repasse_id_fkey"
            columns: ["repasse_id"]
            isOneToOne: false
            referencedRelation: "repasses"
            referencedColumns: ["id"]
          },
        ]
      }
      repasses: {
        Row: {
          adiantado: boolean
          aprovado_por: string | null
          comprovante_url: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_prevista: string | null
          empresa_id: string
          id: string
          locador_id: string
          medicao_id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_repasse"]
          updated_at: string
          valor_abatimentos: number
          valor_bruto: number
          valor_liquido: number
          valor_repasse_mensal: number
          veiculo_id: string
        }
        Insert: {
          adiantado?: boolean
          aprovado_por?: string | null
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_prevista?: string | null
          empresa_id: string
          id?: string
          locador_id: string
          medicao_id: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_repasse"]
          updated_at?: string
          valor_abatimentos?: number
          valor_bruto?: number
          valor_liquido?: number
          valor_repasse_mensal?: number
          veiculo_id: string
        }
        Update: {
          adiantado?: boolean
          aprovado_por?: string | null
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_prevista?: string | null
          empresa_id?: string
          id?: string
          locador_id?: string
          medicao_id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_repasse"]
          updated_at?: string
          valor_abatimentos?: number
          valor_bruto?: number
          valor_liquido?: number
          valor_repasse_mensal?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repasses_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repasses_locador_id_fkey"
            columns: ["locador_id"]
            isOneToOne: false
            referencedRelation: "locadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repasses_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repasses_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_empresas: {
        Row: {
          created_at: string
          created_by: string | null
          empresa_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          nome: string
          perfil: Database["public"]["Enums"]["perfil_usuario"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          nome: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          nome?: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          ano: number | null
          chassi: string | null
          cor: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          foto_url: string | null
          horimetro_atual: number
          id: string
          km_atual: number
          locador_id: string | null
          marca: string | null
          modelo: string | null
          observacoes: string | null
          placa: string
          proprietario: Database["public"]["Enums"]["proprietario_veiculo"]
          renavam: string | null
          status: Database["public"]["Enums"]["status_veiculo"]
          tipo: Database["public"]["Enums"]["tipo_veiculo"]
          updated_at: string
        }
        Insert: {
          ano?: number | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          foto_url?: string | null
          horimetro_atual?: number
          id?: string
          km_atual?: number
          locador_id?: string | null
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          placa: string
          proprietario?: Database["public"]["Enums"]["proprietario_veiculo"]
          renavam?: string | null
          status?: Database["public"]["Enums"]["status_veiculo"]
          tipo?: Database["public"]["Enums"]["tipo_veiculo"]
          updated_at?: string
        }
        Update: {
          ano?: number | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          foto_url?: string | null
          horimetro_atual?: number
          id?: string
          km_atual?: number
          locador_id?: string | null
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          placa?: string
          proprietario?: Database["public"]["Enums"]["proprietario_veiculo"]
          renavam?: string | null
          status?: Database["public"]["Enums"]["status_veiculo"]
          tipo?: Database["public"]["Enums"]["tipo_veiculo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_locador_id_fkey"
            columns: ["locador_id"]
            isOneToOne: false
            referencedRelation: "locadores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contas_pagar_v: {
        Row: {
          anexo_url: string | null
          banco: Database["public"]["Enums"]["banco"] | null
          categoria_id: string | null
          categoria_nome: string | null
          conta_apelido: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          created_by: string | null
          descontar_locador: boolean | null
          descricao: string | null
          empresa_apelido: string | null
          empresa_id: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          grupo_parcela_id: string | null
          id: string | null
          observacoes: string | null
          ordem_servico_id: string | null
          pago_em: string | null
          parcela_num: number | null
          parcela_total: number | null
          placa: string | null
          recorrente: boolean | null
          repasse_id: string | null
          status: string | null
          tipo: Database["public"]["Enums"]["tipo_despesa"] | null
          updated_at: string | null
          valor: number | null
          valor_abatido: number | null
          valor_pago: number | null
          veiculo_id: string | null
          vencimento: string | null
        }
        Relationships: []
      }
      medicoes_v: {
        Row: {
          acrescimos: number | null
          cliente_fantasia: string | null
          cliente_id: string | null
          cliente_nome: string | null
          competencia: string | null
          contrato_id: string | null
          contrato_numero: string | null
          created_at: string | null
          created_by: string | null
          data_emissao: string | null
          data_ultimo_recebimento: string | null
          data_vencimento: string | null
          descontos: number | null
          dia_corte_inicio: number | null
          dias: number | null
          dias_atraso: number | null
          empresa_apelido: string | null
          empresa_id: string | null
          final: boolean | null
          id: string | null
          locador_id: string | null
          margem: number | null
          numero_nf: string | null
          obra_id: string | null
          obra_nome: string | null
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          placa: string | null
          prazo_pagamento_dias: number | null
          proprietario: Database["public"]["Enums"]["proprietario_veiculo"] | null
          repasse_bruto: number | null
          repasse_id: string | null
          repasse_liquido: number | null
          repasse_status: Database["public"]["Enums"]["status_repasse"] | null
          saldo: number | null
          status: Database["public"]["Enums"]["status_medicao"] | null
          status_exibicao: string | null
          tipo_cobranca: string | null
          updated_at: string | null
          valor_base: number | null
          valor_final: number | null
          valor_mensal: number | null
          valor_recebido: number | null
          veiculo_id: string | null
          veiculo_tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
        }
        Relationships: []
      }
      multas_v: {
        Row: {
          anexo_url: string | null
          auto_infracao: string | null
          cliente_nome: string | null
          codigo: string | null
          contrato_id: string | null
          contrato_numero: string | null
          created_at: string | null
          created_by: string | null
          data_infracao: string | null
          descricao: string | null
          empresa_apelido: string | null
          empresa_id: string | null
          id: string | null
          observacoes: string | null
          orgao: string | null
          pago_em: string | null
          placa: string | null
          pontos: number | null
          renavam: string | null
          responsavel: string | null
          status: string | null
          status_exibicao: string | null
          updated_at: string | null
          valor: number | null
          veiculo_id: string | null
          vencimento: string | null
        }
        Relationships: []
      }
      repasses_v: {
        Row: {
          adiantado: boolean | null
          aprovado_por: string | null
          cliente_nome: string | null
          competencia: string | null
          comprovante_url: string | null
          contrato_numero: string | null
          created_at: string | null
          created_by: string | null
          data_pagamento: string | null
          data_prevista: string | null
          dias: number | null
          empresa_apelido: string | null
          empresa_id: string | null
          id: string | null
          locador_id: string | null
          locador_nome: string | null
          medicao_emissao: string | null
          medicao_id: string | null
          medicao_status: Database["public"]["Enums"]["status_medicao"] | null
          medicao_valor: number | null
          medicao_vencimento: string | null
          numero_nf: string | null
          obra_nome: string | null
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          placa: string | null
          responsavel_email: string | null
          responsavel_nome: string | null
          responsavel_whatsapp: string | null
          seria_adiantado: boolean | null
          status: Database["public"]["Enums"]["status_repasse"] | null
          updated_at: string | null
          valor_abatimentos: number | null
          valor_bruto: number | null
          valor_liquido: number | null
          valor_repasse_mensal: number | null
          veiculo_id: string | null
        }
        Relationships: []
      }
      vw_aging_receber: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          data_emissao: string | null
          data_vencimento: string | null
          dias_atraso: number | null
          empresa_apelido: string | null
          empresa_id: string | null
          faixa: string | null
          medicao_id: string | null
          numero_nf: string | null
          placa: string | null
          saldo: number | null
          valor_final: number | null
          valor_recebido: number | null
        }
        Relationships: []
      }
      vw_contas_pagar_periodo: {
        Row: {
          banco: Database["public"]["Enums"]["banco"] | null
          categoria_nome: string | null
          descontar_locador: boolean | null
          descricao: string | null
          empresa_apelido: string | null
          empresa_id: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          fornecedor_nome: string | null
          id: string | null
          mes: string | null
          pago_em: string | null
          parcela_num: number | null
          parcela_total: number | null
          placa: string | null
          status: string | null
          tipo: Database["public"]["Enums"]["tipo_despesa"] | null
          valor: number | null
          valor_pago: number | null
          vencimento: string | null
        }
        Relationships: []
      }
      vw_disponibilidade_frota: {
        Row: {
          dias_locados: number | null
          dias_periodo: number | null
          disponibilidade_pct: number | null
          empresa_id: string | null
          horas_parado: number | null
          horas_periodo: number | null
          mes: string | null
          ocupacao_pct: number | null
          placa: string | null
          qtd_corretivas: number | null
          status_atual: Database["public"]["Enums"]["status_veiculo"] | null
          tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
          veiculo_id: string | null
        }
        Relationships: []
      }
      vw_dre_cliente_mes: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          empresa_apelido: string | null
          empresa_id: string | null
          margem: number | null
          medicoes: number | null
          mes: string | null
          recebido: number | null
          receita: number | null
          repasse: number | null
        }
        Relationships: []
      }
      vw_fluxo_caixa_projetado: {
        Row: {
          data: string | null
          descricao: string | null
          empresa_id: string | null
          tipo: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_locadores_publico: {
        Row: {
          ativo: boolean | null
          id: string | null
          nome: string | null
          telefone: string | null
        }
        Relationships: []
      }
      vw_manutencao_custos: {
        Row: {
          custo: number | null
          custo_descontado_locador: number | null
          empresa_apelido: string | null
          empresa_id: string | null
          horas_parado: number | null
          mes: string | null
          placa: string | null
          qtd_os: number | null
          tipo: Database["public"]["Enums"]["tipo_os"] | null
          veiculo_id: string | null
          veiculo_tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
        }
        Relationships: []
      }
      vw_margem_placa_mes: {
        Row: {
          empresa_apelido: string | null
          empresa_id: string | null
          manutencao: number | null
          margem: number | null
          margem_pct: number | null
          mes: string | null
          outras_despesas: number | null
          placa: string | null
          proprietario: Database["public"]["Enums"]["proprietario_veiculo"] | null
          receita: number | null
          repasse: number | null
          tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
          veiculo_id: string | null
        }
        Relationships: []
      }
      vw_preventivas_status: {
        Row: {
          criterio: string | null
          empresa_id: string | null
          horimetro_atual: number | null
          intervalo_dias: number | null
          intervalo_horas: number | null
          intervalo_km: number | null
          km_atual: number | null
          modelo: string | null
          pct: number | null
          placa: string | null
          plano_id: string | null
          proxima_data: string | null
          proxima_horas: number | null
          proxima_km: number | null
          restante: number | null
          servico: string | null
          status: string | null
          ultima_execucao_data: string | null
          ultima_execucao_horas: number | null
          ultima_execucao_km: number | null
          veiculo_id: string | null
        }
        Relationships: []
      }
      vw_repasses_pendentes: {
        Row: {
          cliente_nome: string | null
          data_prevista: string | null
          dias: number | null
          empresa_apelido: string | null
          empresa_id: string | null
          locador_id: string | null
          locador_nome: string | null
          medicao_status: Database["public"]["Enums"]["status_medicao"] | null
          periodo_fim: string | null
          periodo_inicio: string | null
          placa: string | null
          repasse_id: string | null
          seria_adiantado: boolean | null
          status: Database["public"]["Enums"]["status_repasse"] | null
          valor_abatimentos: number | null
          valor_bruto: number | null
          valor_liquido: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_aplicar_plano_modelo: {
        Args: {
          p_plano: string
        }
        Returns: number
      }
      fn_desmobilizar_contrato: {
        Args: {
          p_contrato: string
          p_data: string
        }
        Returns: string
      }
      fn_fechar_os: {
        Args: {
          p_os: string
          p_data_fechamento?: string
          p_km?: number
          p_horimetro?: number
          p_horas_parado?: number
          p_gerar_conta?: boolean
          p_vencimento?: string
          p_forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          p_conta_bancaria?: string
          p_categoria?: string
          p_diagnostico?: string
        }
        Returns: string
      }
      fn_gerar_medicoes: {
        Args: {
          p_competencia: string
          p_dia_corte?: number
          p_contratos?: string[]
          p_dry_run?: boolean
        }
        Returns: { contrato_id: string; empresa_id: string; periodo_inicio: string; periodo_fim: string; dias: number; valor_mensal: number; valor_final: number; valor_repasse_bruto: number; medicao_id: string }[]
      }
      fn_pagar_repasse: {
        Args: {
          p_repasse: string
          p_data: string
          p_comprovante_url?: string
          p_confirmar_adiantado?: boolean
        }
        Returns: { adiantado: boolean; aprovado_por: string | null; comprovante_url: string | null; created_at: string; created_by: string | null; data_pagamento: string | null; data_prevista: string | null; empresa_id: string; id: string; locador_id: string; medicao_id: string; observacoes: string | null; status: Database["public"]["Enums"]["status_repasse"]; updated_at: string; valor_abatimentos: number; valor_bruto: number; valor_liquido: number; valor_repasse_mensal: number; veiculo_id: string }
      }
      fn_proposta_gerar_contrato: {
        Args: {
          p_proposta: string
        }
        Returns: string
      }
      fn_rodar_jobs: {
        Args: {
        }
        Returns: Json
      }
    }
    Enums: {
      acao_auditoria: "INSERT" | "UPDATE" | "DELETE"
      banco: "Bradesco" | "Sicredi" | "Inter" | "Outro"
      forma_pagamento: "boleto" | "debito_automatico" | "cartao" | "pix" | "transferencia"
      origem_leitura: "manual" | "os" | "importacao"
      perfil_usuario: "admin" | "financeiro" | "faturamento" | "manutencao" | "consulta" | "comercial"
      proprietario_veiculo: "proprio" | "locador"
      severidade_alerta: "info" | "alerta" | "critico"
      status_contrato: "ativo" | "encerrado" | "suspenso"
      status_medicao: "a_faturar" | "faturado" | "recebido_parcial" | "recebido" | "cancelado"
      status_os: "aberta" | "em_execucao" | "aguardando_peca" | "fechada" | "cancelada"
      status_repasse: "previsto" | "liberado" | "pago" | "cancelado"
      status_veiculo: "disponivel" | "locado" | "manutencao" | "parado" | "vendido"
      tipo_chave_pix: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria"
      tipo_despesa: "fixa" | "veiculo"
      tipo_documento: "licenciamento" | "seguro" | "tacografo" | "inspecao_icamento" | "antt" | "outro"
      tipo_item_os: "peca" | "servico"
      tipo_os: "preventiva" | "corretiva" | "pneu" | "inspecao"
      tipo_veiculo: "caminhao" | "guindaste" | "trator" | "munck" | "outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      acao_auditoria: ["INSERT", "UPDATE", "DELETE"],
      banco: ["Bradesco", "Sicredi", "Inter", "Outro"],
      forma_pagamento: ["boleto", "debito_automatico", "cartao", "pix", "transferencia"],
      origem_leitura: ["manual", "os", "importacao"],
      perfil_usuario: ["admin", "financeiro", "faturamento", "manutencao", "consulta", "comercial"],
      proprietario_veiculo: ["proprio", "locador"],
      severidade_alerta: ["info", "alerta", "critico"],
      status_contrato: ["ativo", "encerrado", "suspenso"],
      status_medicao: ["a_faturar", "faturado", "recebido_parcial", "recebido", "cancelado"],
      status_os: ["aberta", "em_execucao", "aguardando_peca", "fechada", "cancelada"],
      status_repasse: ["previsto", "liberado", "pago", "cancelado"],
      status_veiculo: ["disponivel", "locado", "manutencao", "parado", "vendido"],
      tipo_chave_pix: ["cpf", "cnpj", "email", "telefone", "aleatoria"],
      tipo_despesa: ["fixa", "veiculo"],
      tipo_documento: ["licenciamento", "seguro", "tacografo", "inspecao_icamento", "antt", "outro"],
      tipo_item_os: ["peca", "servico"],
      tipo_os: ["preventiva", "corretiva", "pneu", "inspecao"],
      tipo_veiculo: ["caminhao", "guindaste", "trator", "munck", "outro"],
    },
  },
} as const
