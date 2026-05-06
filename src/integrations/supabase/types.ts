export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abastecimentos: {
        Row: {
          combustivel: string
          competencia: string
          conferido_em: string | null
          conferido_por: string | null
          conferido_por_nome: string
          created_at: string
          data: string
          forma_pagamento: string
          foto_bomba_url: string
          foto_painel_url: string
          hora: string
          id: string
          km_atual: number | null
          latitude: number | null
          litros: number
          longitude: number | null
          mecanico_nome: string
          modelo: string
          nfce_chave: string
          nfce_numero: string
          nfce_protocolo: string
          nfce_serie: string
          observacao_conferencia: string
          placa: string
          posto_cnpj: string
          posto_endereco: string
          posto_nome: string
          preenchimento: string
          status: string
          tecnico_id: string | null
          updated_at: string
          user_id: string | null
          vale_codigo: string
          vale_id: string | null
          valor: number
          veiculo_id: string | null
        }
        Insert: {
          combustivel?: string
          competencia?: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string
          created_at?: string
          data?: string
          forma_pagamento?: string
          foto_bomba_url?: string
          foto_painel_url?: string
          hora?: string
          id?: string
          km_atual?: number | null
          latitude?: number | null
          litros?: number
          longitude?: number | null
          mecanico_nome?: string
          modelo?: string
          nfce_chave?: string
          nfce_numero?: string
          nfce_protocolo?: string
          nfce_serie?: string
          observacao_conferencia?: string
          placa?: string
          posto_cnpj?: string
          posto_endereco?: string
          posto_nome?: string
          preenchimento?: string
          status?: string
          tecnico_id?: string | null
          updated_at?: string
          user_id?: string | null
          vale_codigo?: string
          vale_id?: string | null
          valor?: number
          veiculo_id?: string | null
        }
        Update: {
          combustivel?: string
          competencia?: string
          conferido_em?: string | null
          conferido_por?: string | null
          conferido_por_nome?: string
          created_at?: string
          data?: string
          forma_pagamento?: string
          foto_bomba_url?: string
          foto_painel_url?: string
          hora?: string
          id?: string
          km_atual?: number | null
          latitude?: number | null
          litros?: number
          longitude?: number | null
          mecanico_nome?: string
          modelo?: string
          nfce_chave?: string
          nfce_numero?: string
          nfce_protocolo?: string
          nfce_serie?: string
          observacao_conferencia?: string
          placa?: string
          posto_cnpj?: string
          posto_endereco?: string
          posto_nome?: string
          preenchimento?: string
          status?: string
          tecnico_id?: string | null
          updated_at?: string
          user_id?: string | null
          vale_codigo?: string
          vale_id?: string | null
          valor?: number
          veiculo_id?: string | null
        }
        Relationships: []
      }
      acesso_excepcional: {
        Row: {
          aprovado_em: string | null
          aprovado_por_nome: string | null
          aprovado_por_user_id: string | null
          created_at: string
          data_solicitada: string
          hora_fim: string
          hora_inicio: string
          id: string
          motivo: string
          observacao: string | null
          status: string
          updated_at: string
          user_email: string
          user_id: string
          user_nome: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por_nome?: string | null
          aprovado_por_user_id?: string | null
          created_at?: string
          data_solicitada: string
          hora_fim: string
          hora_inicio: string
          id?: string
          motivo?: string
          observacao?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id: string
          user_nome?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por_nome?: string | null
          aprovado_por_user_id?: string | null
          created_at?: string
          data_solicitada?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          motivo?: string
          observacao?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string
          user_nome?: string
        }
        Relationships: []
      }
      acessos_cpf: {
        Row: {
          cpf: string
          created_at: string
          criado_por: string | null
          criado_por_nome: string
          empresa: string
          funcionario_id: string | null
          id: string
          modulo: string
          nome: string
          observacoes: string
          perfil: string
          status: string
          total_acessos: number
          ultimo_acesso_em: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          cpf: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string
          empresa?: string
          funcionario_id?: string | null
          id?: string
          modulo: string
          nome: string
          observacoes?: string
          perfil?: string
          status?: string
          total_acessos?: number
          ultimo_acesso_em?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          cpf?: string
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string
          empresa?: string
          funcionario_id?: string | null
          id?: string
          modulo?: string
          nome?: string
          observacoes?: string
          perfil?: string
          status?: string
          total_acessos?: number
          ultimo_acesso_em?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acessos_cpf_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      acessos_externos: {
        Row: {
          acesso_liberado: boolean
          cpf: string
          cpf_clean: string
          created_at: string
          empresa: string | null
          filial: string | null
          funcao: string | null
          funcionario_id: string | null
          id: string
          modulo: string
          nome: string
          observacoes: string | null
          perfil_acesso: string
          pin: string
          profile_user_id: string | null
          status: string
          ultimo_acesso_em: string | null
          updated_at: string
        }
        Insert: {
          acesso_liberado?: boolean
          cpf: string
          cpf_clean: string
          created_at?: string
          empresa?: string | null
          filial?: string | null
          funcao?: string | null
          funcionario_id?: string | null
          id?: string
          modulo: string
          nome: string
          observacoes?: string | null
          perfil_acesso: string
          pin: string
          profile_user_id?: string | null
          status?: string
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Update: {
          acesso_liberado?: boolean
          cpf?: string
          cpf_clean?: string
          created_at?: string
          empresa?: string | null
          filial?: string | null
          funcao?: string | null
          funcionario_id?: string | null
          id?: string
          modulo?: string
          nome?: string
          observacoes?: string | null
          perfil_acesso?: string
          pin?: string
          profile_user_id?: string | null
          status?: string
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acessos_externos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      acoes_log: {
        Row: {
          acao: string
          antes: Json | null
          arquivo_url: string | null
          cpf: string | null
          created_at: string
          depois: Json | null
          empresa: string | null
          entidade: string
          entidade_id: string | null
          funcionario_id: string | null
          funcionario_nome: string | null
          id: string
          modulo: string
          observacao: string | null
          origem: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          arquivo_url?: string | null
          cpf?: string | null
          created_at?: string
          depois?: Json | null
          empresa?: string | null
          entidade: string
          entidade_id?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          modulo: string
          observacao?: string | null
          origem?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          arquivo_url?: string | null
          cpf?: string | null
          created_at?: string
          depois?: Json | null
          empresa?: string | null
          entidade?: string
          entidade_id?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          modulo?: string
          observacao?: string | null
          origem?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acoes_log_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          email: string
          filial: string
          id: string
          last_activity_at: string
          logged_in_at: string
          module: string
          nome: string
          route: string
          status: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          email?: string
          filial?: string
          id?: string
          last_activity_at?: string
          logged_in_at?: string
          module?: string
          nome?: string
          route?: string
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          email?: string
          filial?: string
          id?: string
          last_activity_at?: string
          logged_in_at?: string
          module?: string
          nome?: string
          route?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      alertas_filial: {
        Row: {
          acao: string
          cpf: string | null
          created_at: string
          dado_anterior: Json | null
          dado_novo: Json | null
          dispositivo: string | null
          empresa_nome: string | null
          filial: string
          funcionario_id: string | null
          funcionario_nome: string | null
          id: string
          ip: string | null
          modulo: string
          nivel: string
          observacao: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_user_id: string | null
          revisado_em: string | null
          revisado_por_nome: string | null
          revisado_por_user_id: string | null
          situacao: string
          updated_at: string
        }
        Insert: {
          acao: string
          cpf?: string | null
          created_at?: string
          dado_anterior?: Json | null
          dado_novo?: Json | null
          dispositivo?: string | null
          empresa_nome?: string | null
          filial: string
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          ip?: string | null
          modulo: string
          nivel?: string
          observacao?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          revisado_em?: string | null
          revisado_por_nome?: string | null
          revisado_por_user_id?: string | null
          situacao?: string
          updated_at?: string
        }
        Update: {
          acao?: string
          cpf?: string | null
          created_at?: string
          dado_anterior?: Json | null
          dado_novo?: Json | null
          dispositivo?: string | null
          empresa_nome?: string | null
          filial?: string
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          ip?: string | null
          modulo?: string
          nivel?: string
          observacao?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          revisado_em?: string | null
          revisado_por_nome?: string | null
          revisado_por_user_id?: string | null
          situacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      almoxarifado_ajustes: {
        Row: {
          created_at: string
          diferenca: number
          id: string
          item_id: string
          motivo: string
          observacao: string
          quantidade_anterior: number
          quantidade_nova: number
          tipo_movimentacao: string
          user_id: string
          usuario_nome: string
        }
        Insert: {
          created_at?: string
          diferenca: number
          id?: string
          item_id: string
          motivo?: string
          observacao?: string
          quantidade_anterior: number
          quantidade_nova: number
          tipo_movimentacao?: string
          user_id: string
          usuario_nome?: string
        }
        Update: {
          created_at?: string
          diferenca?: number
          id?: string
          item_id?: string
          motivo?: string
          observacao?: string
          quantidade_anterior?: number
          quantidade_nova?: number
          tipo_movimentacao?: string
          user_id?: string
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "almoxarifado_ajustes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almoxarifado_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      almoxarifado_carga: {
        Row: {
          company_id: string | null
          created_at: string
          data_carga: string
          email_bruto: string
          empresa_nome: string
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          itens_json: Json
          observacao: string
          status: string
          updated_at: string
          user_id: string
          usuario_nome: string
          veiculo: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          data_carga?: string
          email_bruto?: string
          empresa_nome?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          itens_json?: Json
          observacao?: string
          status?: string
          updated_at?: string
          user_id: string
          usuario_nome?: string
          veiculo?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          data_carga?: string
          email_bruto?: string
          empresa_nome?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          itens_json?: Json
          observacao?: string
          status?: string
          updated_at?: string
          user_id?: string
          usuario_nome?: string
          veiculo?: string
        }
        Relationships: []
      }
      almoxarifado_entradas: {
        Row: {
          created_at: string
          fornecedor: string | null
          id: string
          item_id: string
          nota_fiscal_url: string | null
          observacao: string | null
          quantidade: number
          user_id: string
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          created_at?: string
          fornecedor?: string | null
          id?: string
          item_id: string
          nota_fiscal_url?: string | null
          observacao?: string | null
          quantidade: number
          user_id: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          created_at?: string
          fornecedor?: string | null
          id?: string
          item_id?: string
          nota_fiscal_url?: string | null
          observacao?: string | null
          quantidade?: number
          user_id?: string
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "almoxarifado_entradas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almoxarifado_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      almoxarifado_itens: {
        Row: {
          arquivo_url: string | null
          ativo: boolean
          categoria: string | null
          codigo_sku: string | null
          created_at: string
          descricao: string | null
          empresa: string | null
          estoque_minimo: number
          id: string
          localizacao: string | null
          nome: string
          observacoes: string | null
          quantidade: number
          unidade: string
          updated_at: string
          user_id: string
          valor_unitario: number | null
        }
        Insert: {
          arquivo_url?: string | null
          ativo?: boolean
          categoria?: string | null
          codigo_sku?: string | null
          created_at?: string
          descricao?: string | null
          empresa?: string | null
          estoque_minimo?: number
          id?: string
          localizacao?: string | null
          nome: string
          observacoes?: string | null
          quantidade?: number
          unidade?: string
          updated_at?: string
          user_id: string
          valor_unitario?: number | null
        }
        Update: {
          arquivo_url?: string | null
          ativo?: boolean
          categoria?: string | null
          codigo_sku?: string | null
          created_at?: string
          descricao?: string | null
          empresa?: string | null
          estoque_minimo?: number
          id?: string
          localizacao?: string | null
          nome?: string
          observacoes?: string | null
          quantidade?: number
          unidade?: string
          updated_at?: string
          user_id?: string
          valor_unitario?: number | null
        }
        Relationships: []
      }
      almoxarifado_saidas: {
        Row: {
          created_at: string
          funcionario_nome: string
          id: string
          item_id: string
          motivo: string | null
          observacao: string | null
          quantidade: number
          user_id: string
        }
        Insert: {
          created_at?: string
          funcionario_nome: string
          id?: string
          item_id: string
          motivo?: string | null
          observacao?: string | null
          quantidade: number
          user_id: string
        }
        Update: {
          created_at?: string
          funcionario_nome?: string
          id?: string
          item_id?: string
          motivo?: string | null
          observacao?: string | null
          quantidade?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "almoxarifado_saidas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "almoxarifado_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamento_falta_dsr_detalhe: {
        Row: {
          ajustado_em: string
          ajustado_por_nome: string | null
          apontamento_item_id: string
          created_at: string
          data: string
          funcionario_id: string | null
          id: string
          observacao: string | null
          origem: string
          tipo: string
        }
        Insert: {
          ajustado_em?: string
          ajustado_por_nome?: string | null
          apontamento_item_id: string
          created_at?: string
          data: string
          funcionario_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          tipo: string
        }
        Update: {
          ajustado_em?: string
          ajustado_por_nome?: string | null
          apontamento_item_id?: string
          created_at?: string
          data?: string
          funcionario_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "apontamento_falta_dsr_detalhe_apontamento_item_id_fkey"
            columns: ["apontamento_item_id"]
            isOneToOne: false
            referencedRelation: "apontamentos_contabilidade_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_falta_dsr_detalhe_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamentos_contabilidade: {
        Row: {
          atualizado_por_nome: string | null
          company_id: string | null
          competencia: string
          created_at: string
          criado_por_funcionario_id: string | null
          criado_por_nome: string | null
          criado_por_user_id: string | null
          empresa_nome: string | null
          id: string
          status: string
          total_geral: number
          updated_at: string
        }
        Insert: {
          atualizado_por_nome?: string | null
          company_id?: string | null
          competencia: string
          created_at?: string
          criado_por_funcionario_id?: string | null
          criado_por_nome?: string | null
          criado_por_user_id?: string | null
          empresa_nome?: string | null
          id?: string
          status?: string
          total_geral?: number
          updated_at?: string
        }
        Update: {
          atualizado_por_nome?: string | null
          company_id?: string | null
          competencia?: string
          created_at?: string
          criado_por_funcionario_id?: string | null
          criado_por_nome?: string | null
          criado_por_user_id?: string | null
          empresa_nome?: string | null
          id?: string
          status?: string
          total_geral?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apontamentos_contabilidade_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamentos_contabilidade_criado_por_funcionario_id_fkey"
            columns: ["criado_por_funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamentos_contabilidade_itens: {
        Row: {
          adiantamento: number
          adiantamento_manual: boolean
          alterado_em: string | null
          alterado_por_nome: string | null
          apontamento_id: string
          assistencia_medica: number
          comissao: number
          comissao_base: number
          comissao_percentual: number
          comissao_valor: number
          cpf: string | null
          created_at: string
          desconto_dsr: number
          desconto_falta: number
          dsr_qtd: number
          falta_dsr: number
          faltas_qtd: number
          funcionario_id: string | null
          hora_extra_100: number
          hora_extra_100_horas: number
          hora_extra_50: number
          hora_extra_50_horas: number
          hora_extra_60: number
          hora_extra_60_horas: number
          id: string
          insalubridade: number
          nome: string
          salario: number
          tem_comissao: boolean
          total: number
          updated_at: string
        }
        Insert: {
          adiantamento?: number
          adiantamento_manual?: boolean
          alterado_em?: string | null
          alterado_por_nome?: string | null
          apontamento_id: string
          assistencia_medica?: number
          comissao?: number
          comissao_base?: number
          comissao_percentual?: number
          comissao_valor?: number
          cpf?: string | null
          created_at?: string
          desconto_dsr?: number
          desconto_falta?: number
          dsr_qtd?: number
          falta_dsr?: number
          faltas_qtd?: number
          funcionario_id?: string | null
          hora_extra_100?: number
          hora_extra_100_horas?: number
          hora_extra_50?: number
          hora_extra_50_horas?: number
          hora_extra_60?: number
          hora_extra_60_horas?: number
          id?: string
          insalubridade?: number
          nome: string
          salario?: number
          tem_comissao?: boolean
          total?: number
          updated_at?: string
        }
        Update: {
          adiantamento?: number
          adiantamento_manual?: boolean
          alterado_em?: string | null
          alterado_por_nome?: string | null
          apontamento_id?: string
          assistencia_medica?: number
          comissao?: number
          comissao_base?: number
          comissao_percentual?: number
          comissao_valor?: number
          cpf?: string | null
          created_at?: string
          desconto_dsr?: number
          desconto_falta?: number
          dsr_qtd?: number
          falta_dsr?: number
          faltas_qtd?: number
          funcionario_id?: string | null
          hora_extra_100?: number
          hora_extra_100_horas?: number
          hora_extra_50?: number
          hora_extra_50_horas?: number
          hora_extra_60?: number
          hora_extra_60_horas?: number
          id?: string
          insalubridade?: number
          nome?: string
          salario?: number
          tem_comissao?: boolean
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apontamentos_contabilidade_itens_apontamento_id_fkey"
            columns: ["apontamento_id"]
            isOneToOne: false
            referencedRelation: "apontamentos_contabilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamentos_contabilidade_itens_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamentos_filial: {
        Row: {
          anexo_url: string | null
          competencia: string
          conferido_em: string | null
          conferido_por_nome: string | null
          conferido_por_user_id: string | null
          created_at: string
          data: string | null
          devolucao_motivo: string | null
          empresa_nome: string | null
          enviado_em: string | null
          filial: string
          funcionario_id: string | null
          funcionario_nome: string | null
          id: string
          observacao: string | null
          quantidade: number | null
          registrado_por_nome: string | null
          registrado_por_user_id: string | null
          status: string
          tipo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          anexo_url?: string | null
          competencia: string
          conferido_em?: string | null
          conferido_por_nome?: string | null
          conferido_por_user_id?: string | null
          created_at?: string
          data?: string | null
          devolucao_motivo?: string | null
          empresa_nome?: string | null
          enviado_em?: string | null
          filial: string
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          observacao?: string | null
          quantidade?: number | null
          registrado_por_nome?: string | null
          registrado_por_user_id?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          anexo_url?: string | null
          competencia?: string
          conferido_em?: string | null
          conferido_por_nome?: string | null
          conferido_por_user_id?: string | null
          created_at?: string
          data?: string | null
          devolucao_motivo?: string | null
          empresa_nome?: string | null
          enviado_em?: string | null
          filial?: string
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          observacao?: string | null
          quantidade?: number | null
          registrado_por_nome?: string | null
          registrado_por_user_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      aso_agendamentos: {
        Row: {
          clinica_endereco: string | null
          cpf: string | null
          created_at: string
          ctps: string | null
          data_admissao: string | null
          data_exame: string | null
          data_nascimento: string | null
          empresa: string
          espaco_confinado: boolean | null
          funcao: string | null
          funcionario_nome: string
          id: string
          obra_local: string | null
          observacao: string | null
          pis: string | null
          responsavel_contato: string | null
          rg: string | null
          status: string
          tipo_exame: string
          trabalho_altura: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clinica_endereco?: string | null
          cpf?: string | null
          created_at?: string
          ctps?: string | null
          data_admissao?: string | null
          data_exame?: string | null
          data_nascimento?: string | null
          empresa: string
          espaco_confinado?: boolean | null
          funcao?: string | null
          funcionario_nome: string
          id?: string
          obra_local?: string | null
          observacao?: string | null
          pis?: string | null
          responsavel_contato?: string | null
          rg?: string | null
          status?: string
          tipo_exame?: string
          trabalho_altura?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clinica_endereco?: string | null
          cpf?: string | null
          created_at?: string
          ctps?: string | null
          data_admissao?: string | null
          data_exame?: string | null
          data_nascimento?: string | null
          empresa?: string
          espaco_confinado?: boolean | null
          funcao?: string | null
          funcionario_nome?: string
          id?: string
          obra_local?: string | null
          observacao?: string | null
          pis?: string | null
          responsavel_contato?: string | null
          rg?: string | null
          status?: string
          tipo_exame?: string
          trabalho_altura?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      atestados: {
        Row: {
          aplicado_vr: boolean
          aplicado_vt: boolean
          arquivo_nome: string
          arquivo_url: string
          cid: string
          company_id: string | null
          competencia: string
          created_at: string
          crm: string
          data_fim: string | null
          data_inicio: string | null
          dias_cobertos: number
          empresa_nome: string
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          importado_por_nome: string
          importado_por_user_id: string
          medico: string
          observacao: string
          ocr_confianca: number
          ocr_texto_bruto: string
          status: string
          status_conferencia: string
          updated_at: string
        }
        Insert: {
          aplicado_vr?: boolean
          aplicado_vt?: boolean
          arquivo_nome?: string
          arquivo_url?: string
          cid?: string
          company_id?: string | null
          competencia?: string
          created_at?: string
          crm?: string
          data_fim?: string | null
          data_inicio?: string | null
          dias_cobertos?: number
          empresa_nome?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          importado_por_nome?: string
          importado_por_user_id: string
          medico?: string
          observacao?: string
          ocr_confianca?: number
          ocr_texto_bruto?: string
          status?: string
          status_conferencia?: string
          updated_at?: string
        }
        Update: {
          aplicado_vr?: boolean
          aplicado_vt?: boolean
          arquivo_nome?: string
          arquivo_url?: string
          cid?: string
          company_id?: string | null
          competencia?: string
          created_at?: string
          crm?: string
          data_fim?: string | null
          data_inicio?: string | null
          dias_cobertos?: number
          empresa_nome?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          importado_por_nome?: string
          importado_por_user_id?: string
          medico?: string
          observacao?: string
          ocr_confianca?: number
          ocr_texto_bruto?: string
          status?: string
          status_conferencia?: string
          updated_at?: string
        }
        Relationships: []
      }
      ativos: {
        Row: {
          ano_fabricacao: string | null
          ano_modelo: string | null
          arquivo_url: string | null
          chassi: string | null
          created_at: string
          descricao: string
          empresa: string | null
          id: string
          ipva_arquivo_url: string | null
          ipva_comprovante_url: string | null
          ipva_data_pagamento: string | null
          ipva_observacao: string | null
          ipva_status: string | null
          ipva_valor: number | null
          lic_arquivo_url: string | null
          lic_comprovante_url: string | null
          lic_data_pagamento: string | null
          lic_observacao: string | null
          lic_status: string | null
          lic_valor: number | null
          marca: string | null
          observacao: string | null
          patrimonio: string | null
          placa: string | null
          renavam: string | null
          responsavel_atual: string | null
          seguro_arquivo_url: string | null
          seguro_comprovante_url: string | null
          seguro_valor: number | null
          seguro_vencimento: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string
          vencimento_ipva: string | null
          vencimento_licenciamento: string | null
        }
        Insert: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          arquivo_url?: string | null
          chassi?: string | null
          created_at?: string
          descricao?: string
          empresa?: string | null
          id?: string
          ipva_arquivo_url?: string | null
          ipva_comprovante_url?: string | null
          ipva_data_pagamento?: string | null
          ipva_observacao?: string | null
          ipva_status?: string | null
          ipva_valor?: number | null
          lic_arquivo_url?: string | null
          lic_comprovante_url?: string | null
          lic_data_pagamento?: string | null
          lic_observacao?: string | null
          lic_status?: string | null
          lic_valor?: number | null
          marca?: string | null
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          renavam?: string | null
          responsavel_atual?: string | null
          seguro_arquivo_url?: string | null
          seguro_comprovante_url?: string | null
          seguro_valor?: number | null
          seguro_vencimento?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
          vencimento_ipva?: string | null
          vencimento_licenciamento?: string | null
        }
        Update: {
          ano_fabricacao?: string | null
          ano_modelo?: string | null
          arquivo_url?: string | null
          chassi?: string | null
          created_at?: string
          descricao?: string
          empresa?: string | null
          id?: string
          ipva_arquivo_url?: string | null
          ipva_comprovante_url?: string | null
          ipva_data_pagamento?: string | null
          ipva_observacao?: string | null
          ipva_status?: string | null
          ipva_valor?: number | null
          lic_arquivo_url?: string | null
          lic_comprovante_url?: string | null
          lic_data_pagamento?: string | null
          lic_observacao?: string | null
          lic_status?: string | null
          lic_valor?: number | null
          marca?: string | null
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          renavam?: string | null
          responsavel_atual?: string | null
          seguro_arquivo_url?: string | null
          seguro_comprovante_url?: string | null
          seguro_valor?: number | null
          seguro_vencimento?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          vencimento_ipva?: string | null
          vencimento_licenciamento?: string | null
        }
        Relationships: []
      }
      cartoes_ponto: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          company_id: string | null
          competencia: string
          conferido_em: string | null
          conferido_por_nome: string
          conferido_por_user_id: string | null
          created_at: string
          dias_json: Json
          divergencias_json: Json
          empresa_nome: string
          enviado_fechamento: boolean
          enviado_fechamento_em: string | null
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          importado_por_nome: string
          importado_por_user_id: string
          motivo_ignorado: string
          observacao: string
          ocr_confianca: number
          origem: string
          status_conferencia: string
          totais_json: Json
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string
          arquivo_url?: string
          company_id?: string | null
          competencia?: string
          conferido_em?: string | null
          conferido_por_nome?: string
          conferido_por_user_id?: string | null
          created_at?: string
          dias_json?: Json
          divergencias_json?: Json
          empresa_nome?: string
          enviado_fechamento?: boolean
          enviado_fechamento_em?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          importado_por_nome?: string
          importado_por_user_id: string
          motivo_ignorado?: string
          observacao?: string
          ocr_confianca?: number
          origem?: string
          status_conferencia?: string
          totais_json?: Json
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          company_id?: string | null
          competencia?: string
          conferido_em?: string | null
          conferido_por_nome?: string
          conferido_por_user_id?: string | null
          created_at?: string
          dias_json?: Json
          divergencias_json?: Json
          empresa_nome?: string
          enviado_fechamento?: boolean
          enviado_fechamento_em?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          importado_por_nome?: string
          importado_por_user_id?: string
          motivo_ignorado?: string
          observacao?: string
          ocr_confianca?: number
          origem?: string
          status_conferencia?: string
          totais_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      categorias_financeiras: {
        Row: {
          ativa: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tipo?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          codigo: string
          created_at: string
          descricao: string | null
          empresa_id: string | null
          id: string
          nome: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "centros_custo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_itens_utilizados: {
        Row: {
          chamado_id: string
          created_at: string
          id: string
          item_id: string
          nome_item: string
          quantidade: number
        }
        Insert: {
          chamado_id: string
          created_at?: string
          id?: string
          item_id: string
          nome_item?: string
          quantidade?: number
        }
        Update: {
          chamado_id?: string
          created_at?: string
          id?: string
          item_id?: string
          nome_item?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "chamado_itens_utilizados_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
        ]
      }
      chamados: {
        Row: {
          aceito_em: string | null
          cliente: string
          colaborador_id: string | null
          concluido_em: string | null
          created_at: string
          criado_por: string
          id: string
          info_adicional: string | null
          itens_previstos: string | null
          latitude: number | null
          local_servico: string
          longitude: number | null
          observacoes: string | null
          status: string
          tipo_servico: string
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          aceito_em?: string | null
          cliente?: string
          colaborador_id?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por: string
          id?: string
          info_adicional?: string | null
          itens_previstos?: string | null
          latitude?: number | null
          local_servico?: string
          longitude?: number | null
          observacoes?: string | null
          status?: string
          tipo_servico?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          aceito_em?: string | null
          cliente?: string
          colaborador_id?: string | null
          concluido_em?: string | null
          created_at?: string
          criado_por?: string
          id?: string
          info_adicional?: string | null
          itens_previstos?: string | null
          latitude?: number | null
          local_servico?: string
          longitude?: number | null
          observacoes?: string | null
          status?: string
          tipo_servico?: string
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chamados_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_dn4: {
        Row: {
          cnpj_cpf: string | null
          created_at: string
          empresa_vinculada: string | null
          endereco: string | null
          forma_pagamento_padrao: string | null
          id: string
          nome: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          cnpj_cpf?: string | null
          created_at?: string
          empresa_vinculada?: string | null
          endereco?: string | null
          forma_pagamento_padrao?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          cnpj_cpf?: string | null
          created_at?: string
          empresa_vinculada?: string | null
          endereco?: string | null
          forma_pagamento_padrao?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clientes_fat: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj_cpf: string | null
          contato_responsavel: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          status: string
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          status?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          status?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cobrancas_tentativas: {
        Row: {
          canal: string
          created_at: string
          data: string
          id: string
          observacao: string | null
          proximo_contato: string | null
          resultado: string
          titulo_id: string
          user_id: string
          usuario_nome: string | null
        }
        Insert: {
          canal?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          proximo_contato?: string | null
          resultado?: string
          titulo_id: string
          user_id: string
          usuario_nome?: string | null
        }
        Update: {
          canal?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          proximo_contato?: string | null
          resultado?: string
          titulo_id?: string
          user_id?: string
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_tentativas_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos_receber"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_veiculo: {
        Row: {
          created_at: string
          id: string
          user_id: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      combustivel_galoes: {
        Row: {
          cargo: string
          competencia: string
          created_at: string
          data: string
          foto_url: string
          hora: string
          id: string
          latitude: number | null
          longitude: number | null
          modelo: string
          motorista_nome: string
          observacao: string
          origem: string
          placa: string
          quantidade_litros: number
          tecnico_id: string | null
          tipo_combustivel: string
          updated_at: string
          user_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          cargo?: string
          competencia?: string
          created_at?: string
          data?: string
          foto_url?: string
          hora?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          modelo?: string
          motorista_nome?: string
          observacao?: string
          origem?: string
          placa?: string
          quantidade_litros?: number
          tecnico_id?: string | null
          tipo_combustivel?: string
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          cargo?: string
          competencia?: string
          created_at?: string
          data?: string
          foto_url?: string
          hora?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          modelo?: string
          motorista_nome?: string
          observacao?: string
          origem?: string
          placa?: string
          quantidade_litros?: number
          tecnico_id?: string | null
          tipo_combustivel?: string
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: []
      }
      compras: {
        Row: {
          centro_custo: string
          company_id: string | null
          created_at: string
          data_aprovacao: string | null
          data_compra: string | null
          data_entrega: string | null
          data_solicitacao: string
          empresa_nome: string
          fornecedor: string
          id: string
          item: string
          numero_solicitacao: string
          observacao: string
          quantidade: number
          solicitante_nome: string
          solicitante_user_id: string
          status: string
          unidade: string
          updated_at: string
          valor_estimado: number
          valor_real: number
        }
        Insert: {
          centro_custo?: string
          company_id?: string | null
          created_at?: string
          data_aprovacao?: string | null
          data_compra?: string | null
          data_entrega?: string | null
          data_solicitacao?: string
          empresa_nome?: string
          fornecedor?: string
          id?: string
          item?: string
          numero_solicitacao?: string
          observacao?: string
          quantidade?: number
          solicitante_nome?: string
          solicitante_user_id: string
          status?: string
          unidade?: string
          updated_at?: string
          valor_estimado?: number
          valor_real?: number
        }
        Update: {
          centro_custo?: string
          company_id?: string | null
          created_at?: string
          data_aprovacao?: string | null
          data_compra?: string | null
          data_entrega?: string | null
          data_solicitacao?: string
          empresa_nome?: string
          fornecedor?: string
          id?: string
          item?: string
          numero_solicitacao?: string
          observacao?: string
          quantidade?: number
          solicitante_nome?: string
          solicitante_user_id?: string
          status?: string
          unidade?: string
          updated_at?: string
          valor_estimado?: number
          valor_real?: number
        }
        Relationships: []
      }
      compras_historico: {
        Row: {
          compra_id: string
          created_at: string
          id: string
          observacao: string
          status_anterior: string
          status_novo: string
          user_id: string
          usuario_nome: string
        }
        Insert: {
          compra_id: string
          created_at?: string
          id?: string
          observacao?: string
          status_anterior?: string
          status_novo?: string
          user_id: string
          usuario_nome?: string
        }
        Update: {
          compra_id?: string
          created_at?: string
          id?: string
          observacao?: string
          status_anterior?: string
          status_novo?: string
          user_id?: string
          usuario_nome?: string
        }
        Relationships: []
      }
      conciliacoes: {
        Row: {
          conta_bancaria_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          divergencia: number
          id: string
          observacao: string | null
          status: string
          total_extrato: number
          total_interno: number
          updated_at: string
          user_id: string
        }
        Insert: {
          conta_bancaria_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          divergencia?: number
          id?: string
          observacao?: string | null
          status?: string
          total_extrato?: number
          total_interno?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          conta_bancaria_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          divergencia?: number
          id?: string
          observacao?: string | null
          status?: string
          total_extrato?: number
          total_interno?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      config_acesso_horario: {
        Row: {
          dias_semana: string
          enabled: boolean
          hora_fim: string
          hora_inicio: string
          id: string
          observacao: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dias_semana?: string
          enabled?: boolean
          hora_fim?: string
          hora_inicio?: string
          id?: string
          observacao?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dias_semana?: string
          enabled?: boolean
          hora_fim?: string
          hora_inicio?: string
          id?: string
          observacao?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      config_emails_contabilidade: {
        Row: {
          created_at: string
          email_marisa: string
          email_robson: string
          emails_copia: string
          id: string
          updated_at: string
          updated_by: string | null
          updated_by_nome: string | null
        }
        Insert: {
          created_at?: string
          email_marisa?: string
          email_robson?: string
          emails_copia?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Update: {
          created_at?: string
          email_marisa?: string
          email_robson?: string
          emails_copia?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_nome?: string | null
        }
        Relationships: []
      }
      config_financeiro: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          banco: string | null
          conta: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string
          observacoes: string | null
          saldo_atual: number
          saldo_inicial: number
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          banco?: string | null
          conta?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          observacoes?: string | null
          saldo_atual?: number
          saldo_inicial?: number
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          banco?: string | null
          conta?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          observacoes?: string | null
          saldo_atual?: number
          saldo_inicial?: number
          status?: string
          tipo?: string
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
      contrato_equipamentos: {
        Row: {
          ativo_id: string | null
          contrato_id: string
          created_at: string
          data_envio: string | null
          data_retorno: string | null
          descricao_livre: string | null
          id: string
          observacao: string | null
          patrimonio: string | null
          placa: string | null
          status: string
          updated_at: string
          valor_unitario: number
        }
        Insert: {
          ativo_id?: string | null
          contrato_id: string
          created_at?: string
          data_envio?: string | null
          data_retorno?: string | null
          descricao_livre?: string | null
          id?: string
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          status?: string
          updated_at?: string
          valor_unitario?: number
        }
        Update: {
          ativo_id?: string | null
          contrato_id?: string
          created_at?: string
          data_envio?: string | null
          data_retorno?: string | null
          descricao_livre?: string | null
          id?: string
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          status?: string
          updated_at?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_equipamentos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_equipamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          arquivo_url: string | null
          cliente_id: string
          created_at: string
          data_base_reajuste: string | null
          data_fim: string | null
          data_inicio: string
          dia_vencimento: number | null
          empresa_id: string
          id: string
          indice_reajuste: string | null
          numero: string
          observacoes: string | null
          percentual_reajuste: number | null
          periodicidade: string
          proximo_reajuste: string | null
          regra_faturamento: string
          status: string
          tipo: string
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          arquivo_url?: string | null
          cliente_id: string
          created_at?: string
          data_base_reajuste?: string | null
          data_fim?: string | null
          data_inicio: string
          dia_vencimento?: number | null
          empresa_id: string
          id?: string
          indice_reajuste?: string | null
          numero: string
          observacoes?: string | null
          percentual_reajuste?: number | null
          periodicidade?: string
          proximo_reajuste?: string | null
          regra_faturamento?: string
          status?: string
          tipo?: string
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          arquivo_url?: string | null
          cliente_id?: string
          created_at?: string
          data_base_reajuste?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number | null
          empresa_id?: string
          id?: string
          indice_reajuste?: string | null
          numero?: string
          observacoes?: string | null
          percentual_reajuste?: number | null
          periodicidade?: string
          proximo_reajuste?: string | null
          regra_faturamento?: string
          status?: string
          tipo?: string
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_funcionario: {
        Row: {
          arquivo_assinado_url: string | null
          arquivo_url: string | null
          categoria: string
          company_id: string
          competencia: string | null
          created_at: string
          deleted_at: string | null
          descricao: string | null
          destinatarios: string | null
          empresa_nome: string
          enviado_em: string | null
          enviado_por_nome: string | null
          enviado_por_user_id: string | null
          funcionario_id: string
          funcionario_nome: string
          gerado_por_nome: string
          gerado_por_user_id: string
          id: string
          status: string
          status_envio: string
          tipo_documento: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          arquivo_assinado_url?: string | null
          arquivo_url?: string | null
          categoria?: string
          company_id: string
          competencia?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          destinatarios?: string | null
          empresa_nome?: string
          enviado_em?: string | null
          enviado_por_nome?: string | null
          enviado_por_user_id?: string | null
          funcionario_id: string
          funcionario_nome?: string
          gerado_por_nome?: string
          gerado_por_user_id: string
          id?: string
          status?: string
          status_envio?: string
          tipo_documento?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_assinado_url?: string | null
          arquivo_url?: string | null
          categoria?: string
          company_id?: string
          competencia?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          destinatarios?: string | null
          empresa_nome?: string
          enviado_em?: string | null
          enviado_por_nome?: string | null
          enviado_por_user_id?: string | null
          funcionario_id?: string
          funcionario_nome?: string
          gerado_por_nome?: string
          gerado_por_user_id?: string
          id?: string
          status?: string
          status_envio?: string
          tipo_documento?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          cidade: string
          cnpj: string
          codigo: string
          created_at: string
          id: string
          nome: string
          observacoes: string
          status: string
          updated_at: string
        }
        Insert: {
          cidade?: string
          cnpj?: string
          codigo: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string
          status?: string
          updated_at?: string
        }
        Update: {
          cidade?: string
          cnpj?: string
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      estoque_veiculo: {
        Row: {
          created_at: string
          id: string
          nome_item: string
          quantidade: number
          unidade: string
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome_item: string
          quantidade?: number
          unidade?: string
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome_item?: string
          quantidade?: number
          unidade?: string
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      fatura_itens: {
        Row: {
          contrato_equipamento_id: string | null
          created_at: string
          descricao: string
          fatura_id: string
          id: string
          observacao: string | null
          quantidade: number
          total: number
          valor_unitario: number
        }
        Insert: {
          contrato_equipamento_id?: string | null
          created_at?: string
          descricao?: string
          fatura_id: string
          id?: string
          observacao?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Update: {
          contrato_equipamento_id?: string | null
          created_at?: string
          descricao?: string
          fatura_id?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "fatura_itens_contrato_equipamento_id_fkey"
            columns: ["contrato_equipamento_id"]
            isOneToOne: false
            referencedRelation: "contrato_equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_itens_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_itens_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamento_dn4: {
        Row: {
          cliente_id: string | null
          cliente_nome: string
          cnpj_cpf: string | null
          competencia: string | null
          created_at: string
          criado_por_nome: string | null
          criado_por_user_id: string | null
          data_emissao: string
          data_servico: string | null
          descricao: string
          empresa_filial: string | null
          forma_pagamento: string | null
          id: string
          numero_pedido: string | null
          observacoes: string | null
          quantidade: number
          status: string
          updated_at: string
          valor_total: number
          valor_unitario: number
          vencimento: string | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome: string
          cnpj_cpf?: string | null
          competencia?: string | null
          created_at?: string
          criado_por_nome?: string | null
          criado_por_user_id?: string | null
          data_emissao?: string
          data_servico?: string | null
          descricao: string
          empresa_filial?: string | null
          forma_pagamento?: string | null
          id?: string
          numero_pedido?: string | null
          observacoes?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
          vencimento?: string | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string
          cnpj_cpf?: string | null
          competencia?: string | null
          created_at?: string
          criado_por_nome?: string | null
          criado_por_user_id?: string | null
          data_emissao?: string
          data_servico?: string | null
          descricao?: string
          empresa_filial?: string | null
          forma_pagamento?: string | null
          id?: string
          numero_pedido?: string | null
          observacoes?: string | null
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faturamento_dn4_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_dn4"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamento_historico: {
        Row: {
          acao: string
          cliente_id: string | null
          contrato_id: string | null
          created_at: string
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          fatura_id: string | null
          id: string
          user_id: string
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          fatura_id?: string | null
          id?: string
          user_id: string
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          fatura_id?: string | null
          id?: string
          user_id?: string
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faturamento_historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_historico_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_historico_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_historico_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamento_pendencias: {
        Row: {
          cliente_id: string | null
          contrato_id: string | null
          created_at: string
          descricao: string
          fatura_id: string | null
          id: string
          resolvida_em: string | null
          resolvida_por: string | null
          severidade: string
          status: string
          tipo: string
        }
        Insert: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          descricao: string
          fatura_id?: string | null
          id?: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          severidade?: string
          status?: string
          tipo: string
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          descricao?: string
          fatura_id?: string | null
          id?: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          severidade?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturamento_pendencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_pendencias_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_pendencias_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturamento_pendencias_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas: {
        Row: {
          acrescimos: number
          arquivo_pdf_url: string | null
          cliente_id: string
          competencia: string
          contrato_id: string
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          descontos: number
          destinatarios: string | null
          empresa_id: string
          enviada_em: string | null
          id: string
          medicao_id: string | null
          numero: string
          observacoes: string | null
          reajuste_aplicado: number
          status: string
          subtotal: number
          total: number
          updated_at: string
          valor_pago: number
        }
        Insert: {
          acrescimos?: number
          arquivo_pdf_url?: string | null
          cliente_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento: string
          descontos?: number
          destinatarios?: string | null
          empresa_id: string
          enviada_em?: string | null
          id?: string
          medicao_id?: string | null
          numero: string
          observacoes?: string | null
          reajuste_aplicado?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          valor_pago?: number
        }
        Update: {
          acrescimos?: number
          arquivo_pdf_url?: string | null
          cliente_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descontos?: number
          destinatarios?: string | null
          empresa_id?: string
          enviada_em?: string | null
          id?: string
          medicao_id?: string | null
          numero?: string
          observacoes?: string | null
          reajuste_aplicado?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["medicao_id"]
          },
        ]
      }
      fechamentos_filial: {
        Row: {
          company_id: string
          competencia: string
          created_at: string
          empresa_nome: string
          fechado_em: string | null
          fechado_por_nome: string
          fechado_por_user_id: string | null
          id: string
          motivo_reabertura: string
          observacoes: string
          reaberto_em: string | null
          reaberto_por_nome: string
          reaberto_por_user_id: string | null
          status: string
          total_descontos: number
          total_funcionarios: number
          total_liquido: number
          total_proventos: number
          updated_at: string
        }
        Insert: {
          company_id: string
          competencia: string
          created_at?: string
          empresa_nome?: string
          fechado_em?: string | null
          fechado_por_nome?: string
          fechado_por_user_id?: string | null
          id?: string
          motivo_reabertura?: string
          observacoes?: string
          reaberto_em?: string | null
          reaberto_por_nome?: string
          reaberto_por_user_id?: string | null
          status?: string
          total_descontos?: number
          total_funcionarios?: number
          total_liquido?: number
          total_proventos?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          competencia?: string
          created_at?: string
          empresa_nome?: string
          fechado_em?: string | null
          fechado_por_nome?: string
          fechado_por_user_id?: string | null
          id?: string
          motivo_reabertura?: string
          observacoes?: string
          reaberto_em?: string | null
          reaberto_por_nome?: string
          reaberto_por_user_id?: string | null
          status?: string
          total_descontos?: number
          total_funcionarios?: number
          total_liquido?: number
          total_proventos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_filial_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos_historico: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          fechamento_id: string
          id: string
          user_id: string
          usuario_nome: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          fechamento_id: string
          id?: string
          user_id: string
          usuario_nome?: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          fechamento_id?: string
          id?: string
          user_id?: string
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_historico_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_filial"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          ativo: boolean
          cidade: string | null
          created_at: string
          data: string
          empresa_id: string | null
          filial_id: string | null
          id: string
          nome: string
          observacoes: string | null
          tipo: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          data: string
          empresa_id?: string | null
          filial_id?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          data?: string
          empresa_id?: string | null
          filial_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ferias_avisos: {
        Row: {
          assinado_pdf_url: string
          aviso_pdf_url: string
          company_id: string | null
          created_at: string
          data_entrega: string | null
          data_pagamento: string | null
          data_retorno: string
          dias_ferias: number
          empresa_nome: string
          enviado_contabilidade_destinos: string | null
          enviado_contabilidade_em: string | null
          enviado_contabilidade_por: string | null
          funcionario_cargo: string
          funcionario_cpf: string
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          observacao: string
          periodo_aquisitivo_fim: string | null
          periodo_aquisitivo_inicio: string | null
          periodo_gozo_fim: string
          periodo_gozo_inicio: string
          prazo_pagamento: string | null
          status: string
          status_pagamento: string
          updated_at: string
          user_id: string
          user_nome: string
          valor_pago: number | null
        }
        Insert: {
          assinado_pdf_url?: string
          aviso_pdf_url?: string
          company_id?: string | null
          created_at?: string
          data_entrega?: string | null
          data_pagamento?: string | null
          data_retorno: string
          dias_ferias?: number
          empresa_nome?: string
          enviado_contabilidade_destinos?: string | null
          enviado_contabilidade_em?: string | null
          enviado_contabilidade_por?: string | null
          funcionario_cargo?: string
          funcionario_cpf?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          observacao?: string
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          periodo_gozo_fim: string
          periodo_gozo_inicio: string
          prazo_pagamento?: string | null
          status?: string
          status_pagamento?: string
          updated_at?: string
          user_id: string
          user_nome?: string
          valor_pago?: number | null
        }
        Update: {
          assinado_pdf_url?: string
          aviso_pdf_url?: string
          company_id?: string | null
          created_at?: string
          data_entrega?: string | null
          data_pagamento?: string | null
          data_retorno?: string
          dias_ferias?: number
          empresa_nome?: string
          enviado_contabilidade_destinos?: string | null
          enviado_contabilidade_em?: string | null
          enviado_contabilidade_por?: string | null
          funcionario_cargo?: string
          funcionario_cpf?: string
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          observacao?: string
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          periodo_gozo_fim?: string
          periodo_gozo_inicio?: string
          prazo_pagamento?: string | null
          status?: string
          status_pagamento?: string
          updated_at?: string
          user_id?: string
          user_nome?: string
          valor_pago?: number | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          agencia: string | null
          banco: string | null
          categoria: string | null
          cep: string | null
          cidade: string | null
          cnpj_cpf: string | null
          conta: string | null
          contato_responsavel: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          observacoes: string | null
          pix: string | null
          razao_social: string
          status: string
          telefone: string | null
          tipo_conta: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          banco?: string | null
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          conta?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          pix?: string | null
          razao_social: string
          status?: string
          telefone?: string | null
          tipo_conta?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          banco?: string | null
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          conta?: string | null
          contato_responsavel?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          pix?: string | null
          razao_social?: string
          status?: string
          telefone?: string | null
          tipo_conta?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          acesso_atualizado_em: string | null
          acesso_cpf_liberado: boolean
          acesso_motivo: string | null
          acesso_status: string
          agencia: string
          banco: string
          cargo: string
          categoria: string
          celular: string
          codigo: string
          company_id: string
          conta: string
          cpf: string
          created_at: string
          data_admissao: string | null
          data_exame_medico: string | null
          email: string
          endereco: string
          id: string
          insalubridade_ativa: boolean
          insalubridade_valor: number
          inss: number | null
          liquido: number | null
          matricula_esocial: string
          nome: string
          observacoes: string
          pix: string
          referencia_competencia: string | null
          registro: string
          rg: string
          salario_base: number
          setor: string | null
          status: string
          telefone: string
          updated_at: string
          va_ativo: boolean
          va_mensal: number
          vr_ativo: boolean
          vr_diario: number
          vt_ativo: boolean
          vt_diario: number
        }
        Insert: {
          acesso_atualizado_em?: string | null
          acesso_cpf_liberado?: boolean
          acesso_motivo?: string | null
          acesso_status?: string
          agencia?: string
          banco?: string
          cargo?: string
          categoria?: string
          celular?: string
          codigo?: string
          company_id: string
          conta?: string
          cpf?: string
          created_at?: string
          data_admissao?: string | null
          data_exame_medico?: string | null
          email?: string
          endereco?: string
          id?: string
          insalubridade_ativa?: boolean
          insalubridade_valor?: number
          inss?: number | null
          liquido?: number | null
          matricula_esocial?: string
          nome: string
          observacoes?: string
          pix?: string
          referencia_competencia?: string | null
          registro?: string
          rg?: string
          salario_base?: number
          setor?: string | null
          status?: string
          telefone?: string
          updated_at?: string
          va_ativo?: boolean
          va_mensal?: number
          vr_ativo?: boolean
          vr_diario?: number
          vt_ativo?: boolean
          vt_diario?: number
        }
        Update: {
          acesso_atualizado_em?: string | null
          acesso_cpf_liberado?: boolean
          acesso_motivo?: string | null
          acesso_status?: string
          agencia?: string
          banco?: string
          cargo?: string
          categoria?: string
          celular?: string
          codigo?: string
          company_id?: string
          conta?: string
          cpf?: string
          created_at?: string
          data_admissao?: string | null
          data_exame_medico?: string | null
          email?: string
          endereco?: string
          id?: string
          insalubridade_ativa?: boolean
          insalubridade_valor?: number
          inss?: number | null
          liquido?: number | null
          matricula_esocial?: string
          nome?: string
          observacoes?: string
          pix?: string
          referencia_competencia?: string | null
          registro?: string
          rg?: string
          salario_base?: number
          setor?: string | null
          status?: string
          telefone?: string
          updated_at?: string
          va_ativo?: boolean
          va_mensal?: number
          vr_ativo?: boolean
          vr_diario?: number
          vt_ativo?: boolean
          vt_diario?: number
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      impostos: {
        Row: {
          aliquota: number
          base_calculo: number
          competencia: string
          created_at: string
          empresa_id: string | null
          fatura_id: string | null
          id: string
          retido: boolean
          tipo: string
          titulo_pagar_id: string | null
          valor: number
        }
        Insert: {
          aliquota?: number
          base_calculo?: number
          competencia: string
          created_at?: string
          empresa_id?: string | null
          fatura_id?: string | null
          id?: string
          retido?: boolean
          tipo: string
          titulo_pagar_id?: string | null
          valor?: number
        }
        Update: {
          aliquota?: number
          base_calculo?: number
          competencia?: string
          created_at?: string
          empresa_id?: string | null
          fatura_id?: string | null
          id?: string
          retido?: boolean
          tipo?: string
          titulo_pagar_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "impostos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impostos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impostos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impostos_titulo_pagar_id_fkey"
            columns: ["titulo_pagar_id"]
            isOneToOne: false
            referencedRelation: "titulos_pagar"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_historico: {
        Row: {
          campo: string
          company_id: string | null
          competencia: string | null
          created_at: string
          funcionario_id: string | null
          id: string
          lancamento_id: string | null
          user_id: string | null
          usuario_nome: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo: string
          company_id?: string | null
          competencia?: string | null
          created_at?: string
          funcionario_id?: string | null
          id?: string
          lancamento_id?: string | null
          user_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo?: string
          company_id?: string | null
          competencia?: string | null
          created_at?: string
          funcionario_id?: string | null
          id?: string
          lancamento_id?: string | null
          user_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      lancamentos_mensais: {
        Row: {
          adiantamento: number
          adicionais: number
          apagado_em: string | null
          apagado_por_nome: string | null
          apagado_por_user_id: string | null
          atrasos: number
          bloqueado: boolean
          comissao_base: number
          company_id: string
          competencia: string
          created_at: string
          descontos_diversos: number
          faltas_dias: number
          fechamento_id: string | null
          funcionario_id: string
          he100: number
          he50: number
          id: string
          insalubridade_aplicada: boolean
          observacoes: string
          origem: string
          status_conferencia: string
          updated_at: string
          va_aplicado: boolean
          vr_aplicado: boolean
          vr_dias: number
          vt_aplicado: boolean
          vt_desconto: number
        }
        Insert: {
          adiantamento?: number
          adicionais?: number
          apagado_em?: string | null
          apagado_por_nome?: string | null
          apagado_por_user_id?: string | null
          atrasos?: number
          bloqueado?: boolean
          comissao_base?: number
          company_id: string
          competencia: string
          created_at?: string
          descontos_diversos?: number
          faltas_dias?: number
          fechamento_id?: string | null
          funcionario_id: string
          he100?: number
          he50?: number
          id?: string
          insalubridade_aplicada?: boolean
          observacoes?: string
          origem?: string
          status_conferencia?: string
          updated_at?: string
          va_aplicado?: boolean
          vr_aplicado?: boolean
          vr_dias?: number
          vt_aplicado?: boolean
          vt_desconto?: number
        }
        Update: {
          adiantamento?: number
          adicionais?: number
          apagado_em?: string | null
          apagado_por_nome?: string | null
          apagado_por_user_id?: string | null
          atrasos?: number
          bloqueado?: boolean
          comissao_base?: number
          company_id?: string
          competencia?: string
          created_at?: string
          descontos_diversos?: number
          faltas_dias?: number
          fechamento_id?: string | null
          funcionario_id?: string
          he100?: number
          he50?: number
          id?: string
          insalubridade_aplicada?: boolean
          observacoes?: string
          origem?: string
          status_conferencia?: string
          updated_at?: string
          va_aplicado?: boolean
          vr_aplicado?: boolean
          vr_dias?: number
          vt_aplicado?: boolean
          vt_desconto?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_mensais_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_mensais_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_filial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_mensais_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      medicao_itens: {
        Row: {
          ajuste: number
          contrato_equipamento_id: string | null
          created_at: string
          descricao: string
          dias_faturaveis: number | null
          id: string
          medicao_id: string
          observacao: string | null
          quantidade: number
          total: number
          valor_unitario: number
        }
        Insert: {
          ajuste?: number
          contrato_equipamento_id?: string | null
          created_at?: string
          descricao?: string
          dias_faturaveis?: number | null
          id?: string
          medicao_id: string
          observacao?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Update: {
          ajuste?: number
          contrato_equipamento_id?: string | null
          created_at?: string
          descricao?: string
          dias_faturaveis?: number | null
          id?: string
          medicao_id?: string
          observacao?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicao_itens_contrato_equipamento_id_fkey"
            columns: ["contrato_equipamento_id"]
            isOneToOne: false
            referencedRelation: "contrato_equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicao_itens_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicao_itens_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["medicao_id"]
          },
        ]
      }
      medicoes: {
        Row: {
          aprovada_em: string | null
          aprovada_por: string | null
          competencia: string
          contrato_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          fatura_id: string | null
          id: string
          observacoes: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          competencia: string
          contrato_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          fatura_id?: string | null
          id?: string
          observacoes?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          competencia?: string
          contrato_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          fatura_id?: string | null
          id?: string
          observacoes?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_bancarias: {
        Row: {
          conciliacao_id: string | null
          conciliado: boolean
          conta_bancaria_id: string
          created_at: string
          data: string
          data_conciliacao: string | null
          descricao: string | null
          id: string
          origem: string | null
          pagamento_id: string | null
          recebimento_id: string | null
          tipo: string
          user_id: string | null
          valor: number
        }
        Insert: {
          conciliacao_id?: string | null
          conciliado?: boolean
          conta_bancaria_id: string
          created_at?: string
          data?: string
          data_conciliacao?: string | null
          descricao?: string | null
          id?: string
          origem?: string | null
          pagamento_id?: string | null
          recebimento_id?: string | null
          tipo: string
          user_id?: string | null
          valor: number
        }
        Update: {
          conciliacao_id?: string | null
          conciliado?: boolean
          conta_bancaria_id?: string
          created_at?: string
          data?: string
          data_conciliacao?: string | null
          descricao?: string | null
          id?: string
          origem?: string | null
          pagamento_id?: string | null
          recebimento_id?: string | null
          tipo?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_bancarias_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_recebimento_id_fkey"
            columns: ["recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_diario: {
        Row: {
          company_id: string
          competencia: string
          created_at: string
          data: string
          funcionario_id: string
          id: string
          observacao: string
          quantidade: number
          registrado_por_nome: string
          registrado_por_user_id: string
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          company_id: string
          competencia: string
          created_at?: string
          data: string
          funcionario_id: string
          id?: string
          observacao?: string
          quantidade?: number
          registrado_por_nome?: string
          registrado_por_user_id: string
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          company_id?: string
          competencia?: string
          created_at?: string
          data?: string
          funcionario_id?: string
          id?: string
          observacao?: string
          quantidade?: number
          registrado_por_nome?: string
          registrado_por_user_id?: string
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimento_diario_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_diario_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          conta_bancaria_id: string | null
          created_at: string
          data: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          titulo_id: string
          user_id: string
          usuario_nome: string | null
          valor: number
        }
        Insert: {
          conta_bancaria_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          titulo_id: string
          user_id: string
          usuario_nome?: string | null
          valor: number
        }
        Update: {
          conta_bancaria_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          titulo_id?: string
          user_id?: string
          usuario_nome?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos_pagar"
            referencedColumns: ["id"]
          },
        ]
      }
      postos: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          observacao: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          observacao?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prestadores: {
        Row: {
          banco: string | null
          banco_agencia: string | null
          banco_conta: string | null
          banco_tipo_conta: string | null
          banco_titular: string | null
          cpf: string | null
          created_at: string
          dias_trabalho: string | null
          empresa_pagadora: string
          funcao: string | null
          id: string
          nome: string
          observacao: string | null
          pagamento_tipo: string
          proximo_pagamento: string | null
          status: string
          ultimo_pagamento: string | null
          updated_at: string
          user_id: string
          valor_diario: number | null
        }
        Insert: {
          banco?: string | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_tipo_conta?: string | null
          banco_titular?: string | null
          cpf?: string | null
          created_at?: string
          dias_trabalho?: string | null
          empresa_pagadora?: string
          funcao?: string | null
          id?: string
          nome: string
          observacao?: string | null
          pagamento_tipo?: string
          proximo_pagamento?: string | null
          status?: string
          ultimo_pagamento?: string | null
          updated_at?: string
          user_id: string
          valor_diario?: number | null
        }
        Update: {
          banco?: string | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_tipo_conta?: string | null
          banco_titular?: string | null
          cpf?: string | null
          created_at?: string
          dias_trabalho?: string | null
          empresa_pagadora?: string
          funcao?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          pagamento_tipo?: string
          proximo_pagamento?: string | null
          status?: string
          ultimo_pagamento?: string | null
          updated_at?: string
          user_id?: string
          valor_diario?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          cpf: string | null
          cpf_clean: string | null
          created_at: string
          email: string
          id: string
          nome_completo: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string | null
          cpf?: string | null
          cpf_clean?: string | null
          created_at?: string
          email: string
          id?: string
          nome_completo: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cargo?: string | null
          cpf?: string | null
          cpf_clean?: string | null
          created_at?: string
          email?: string
          id?: string
          nome_completo?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qr_access_logs: {
        Row: {
          codigo_qr: string | null
          data_hora_acesso: string
          dispositivo: string | null
          erro_retornado: string | null
          id: string
          navegador: string | null
          status_abertura: string
        }
        Insert: {
          codigo_qr?: string | null
          data_hora_acesso?: string
          dispositivo?: string | null
          erro_retornado?: string | null
          id?: string
          navegador?: string | null
          status_abertura?: string
        }
        Update: {
          codigo_qr?: string | null
          data_hora_acesso?: string
          dispositivo?: string | null
          erro_retornado?: string | null
          id?: string
          navegador?: string | null
          status_abertura?: string
        }
        Relationships: []
      }
      reajustes: {
        Row: {
          aplicado_por: string | null
          contrato_id: string
          created_at: string
          data_aplicacao: string
          id: string
          indice: string | null
          observacao: string | null
          percentual: number
          status: string
          valor_anterior: number
          valor_novo: number
        }
        Insert: {
          aplicado_por?: string | null
          contrato_id: string
          created_at?: string
          data_aplicacao?: string
          id?: string
          indice?: string | null
          observacao?: string | null
          percentual?: number
          status?: string
          valor_anterior?: number
          valor_novo?: number
        }
        Update: {
          aplicado_por?: string | null
          contrato_id?: string
          created_at?: string
          data_aplicacao?: string
          id?: string
          indice?: string | null
          observacao?: string | null
          percentual?: number
          status?: string
          valor_anterior?: number
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "reajustes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos: {
        Row: {
          conta_bancaria_id: string | null
          created_at: string
          data: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          titulo_id: string
          user_id: string
          usuario_nome: string | null
          valor: number
        }
        Insert: {
          conta_bancaria_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          titulo_id: string
          user_id: string
          usuario_nome?: string | null
          valor: number
        }
        Update: {
          conta_bancaria_id?: string | null
          created_at?: string
          data?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          titulo_id?: string
          user_id?: string
          usuario_nome?: string | null
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
            foreignKeyName: "recebimentos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos_receber"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_km: {
        Row: {
          created_at: string
          data: string
          foto_url: string | null
          hora: string
          id: string
          km_valor: number
          latitude: number | null
          longitude: number | null
          tipo_registro: string
          user_id: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          foto_url?: string | null
          hora?: string
          id?: string
          km_valor: number
          latitude?: number | null
          longitude?: number | null
          tipo_registro?: string
          user_id: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          data?: string
          foto_url?: string | null
          hora?: string
          id?: string
          km_valor?: number
          latitude?: number | null
          longitude?: number | null
          tipo_registro?: string
          user_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_km_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_ponto: {
        Row: {
          created_at: string
          data: string
          endereco_formatado: string | null
          hora: string
          id: string
          latitude: number | null
          longitude: number | null
          selfie_url: string | null
          tipo: string
          user_id: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          data?: string
          endereco_formatado?: string | null
          hora?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          selfie_url?: string | null
          tipo: string
          user_id: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          endereco_formatado?: string | null
          hora?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          selfie_url?: string | null
          tipo?: string
          user_id?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_ponto_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      renegociacoes: {
        Row: {
          autorizado_por: string
          autorizado_por_nome: string | null
          created_at: string
          data_negociacao: string
          desconto_concedido: number
          id: string
          motivo: string | null
          observacao: string | null
          parcelas: number
          tipo: string
          titulo_pagar_id: string | null
          titulo_receber_id: string | null
          valor_novo: number
          valor_original: number
        }
        Insert: {
          autorizado_por: string
          autorizado_por_nome?: string | null
          created_at?: string
          data_negociacao?: string
          desconto_concedido?: number
          id?: string
          motivo?: string | null
          observacao?: string | null
          parcelas?: number
          tipo?: string
          titulo_pagar_id?: string | null
          titulo_receber_id?: string | null
          valor_novo?: number
          valor_original?: number
        }
        Update: {
          autorizado_por?: string
          autorizado_por_nome?: string | null
          created_at?: string
          data_negociacao?: string
          desconto_concedido?: number
          id?: string
          motivo?: string | null
          observacao?: string | null
          parcelas?: number
          tipo?: string
          titulo_pagar_id?: string | null
          titulo_receber_id?: string | null
          valor_novo?: number
          valor_original?: number
        }
        Relationships: [
          {
            foreignKeyName: "renegociacoes_titulo_pagar_id_fkey"
            columns: ["titulo_pagar_id"]
            isOneToOne: false
            referencedRelation: "titulos_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renegociacoes_titulo_receber_id_fkey"
            columns: ["titulo_receber_id"]
            isOneToOne: false
            referencedRelation: "titulos_receber"
            referencedColumns: ["id"]
          },
        ]
      }
      rescisao_historico: {
        Row: {
          acao: string
          cpf: string | null
          created_at: string
          empresa: string | null
          funcionario_id: string | null
          funcionario_nome: string | null
          id: string
          observacao: string | null
          rescisao_id: string
          rubrica: string | null
          user_email: string | null
          user_id: string | null
          valor_anterior: number | null
          valor_novo: number | null
        }
        Insert: {
          acao: string
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          observacao?: string | null
          rescisao_id: string
          rubrica?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Update: {
          acao?: string
          cpf?: string | null
          created_at?: string
          empresa?: string | null
          funcionario_id?: string | null
          funcionario_nome?: string | null
          id?: string
          observacao?: string | null
          rescisao_id?: string
          rubrica?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rescisao_historico_rescisao_id_fkey"
            columns: ["rescisao_id"]
            isOneToOne: false
            referencedRelation: "rescisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      rescisoes: {
        Row: {
          aviso_previo: string
          aviso_previo_valor: number
          bairro: string | null
          cargo: string
          categoria_trabalhador: string | null
          causa_afastamento: string | null
          cep: string | null
          codigo_afastamento: string | null
          codigo_sindical: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          ctps: string | null
          data_admissao: string | null
          data_aviso: string | null
          data_desligamento: string
          data_nascimento: string | null
          decimo_terceiro: number
          ded_100_pensao: number | null
          ded_101_adiantamento: number | null
          ded_102_adiant_13: number | null
          ded_103_aviso_indenizado: number | null
          ded_104_indenizacao_480: number | null
          ded_105_emprestimo_consig: number | null
          ded_106_vale_transporte: number | null
          ded_112_1_inss: number | null
          ded_112_2_inss_13: number | null
          ded_114_1_irrf: number | null
          ded_114_2_irrf_13: number | null
          ded_115_2_arredondamento: number | null
          ded_115_3_vale_refeicao: number | null
          dependentes: number
          dias_aviso: number
          empresa_bairro: string | null
          empresa_cep: string | null
          empresa_cnae: string | null
          empresa_cnpj: string | null
          empresa_endereco: string | null
          empresa_municipio: string | null
          empresa_nome: string
          empresa_uf: string | null
          endereco: string | null
          ferias_proporcionais: number
          ferias_vencidas: number
          fgts_mes: number
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          inss: number
          irrf: number
          liquido: number
          liquido_rescisorio: number | null
          motivo: string
          multa_fgts: number
          municipio: string | null
          nome_mae: string | null
          observacoes: string
          outros_descontos: number
          pensao_fgts: number | null
          pensao_trct: number | null
          pis_pasep: string | null
          remuneracao_mes_anterior: number | null
          salario_base: number
          saldo_fgts_depositado: number
          saldo_salario: number
          sindicato_cnpj: string | null
          sindicato_nome: string | null
          snapshot_json: Json
          status: string
          terco_ferias: number
          tipo_contrato: string | null
          tipo_rescisao: string
          total_bruto: number | null
          total_dedu: number | null
          total_descontos: number
          total_proventos: number
          uf: string | null
          updated_at: string
          user_id: string | null
          usuario_nome: string
          verba_50_saldo_dias: number | null
          verba_51_comissoes: number | null
          verba_52_gratificacao: number | null
          verba_53_insalubridade: number | null
          verba_54_periculosidade: number | null
          verba_55_adic_noturno: number | null
          verba_56_horas_extras: number | null
          verba_57_gorjetas: number | null
          verba_58_dsr: number | null
          verba_59_reflexo_dsr: number | null
          verba_60_multa_477: number | null
          verba_61_multa_479: number | null
          verba_62_salario_familia: number | null
          verba_63_13_proporcional: number | null
          verba_64_13_exercicio: number | null
          verba_65_ferias_proporcionais: number | null
          verba_66_ferias_vencidas: number | null
          verba_68_terco_ferias: number | null
          verba_69_aviso_indenizado: number | null
          verba_70_13_sobre_aviso: number | null
          verba_71_ferias_sobre_aviso: number | null
        }
        Insert: {
          aviso_previo?: string
          aviso_previo_valor?: number
          bairro?: string | null
          cargo?: string
          categoria_trabalhador?: string | null
          causa_afastamento?: string | null
          cep?: string | null
          codigo_afastamento?: string | null
          codigo_sindical?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          ctps?: string | null
          data_admissao?: string | null
          data_aviso?: string | null
          data_desligamento: string
          data_nascimento?: string | null
          decimo_terceiro?: number
          ded_100_pensao?: number | null
          ded_101_adiantamento?: number | null
          ded_102_adiant_13?: number | null
          ded_103_aviso_indenizado?: number | null
          ded_104_indenizacao_480?: number | null
          ded_105_emprestimo_consig?: number | null
          ded_106_vale_transporte?: number | null
          ded_112_1_inss?: number | null
          ded_112_2_inss_13?: number | null
          ded_114_1_irrf?: number | null
          ded_114_2_irrf_13?: number | null
          ded_115_2_arredondamento?: number | null
          ded_115_3_vale_refeicao?: number | null
          dependentes?: number
          dias_aviso?: number
          empresa_bairro?: string | null
          empresa_cep?: string | null
          empresa_cnae?: string | null
          empresa_cnpj?: string | null
          empresa_endereco?: string | null
          empresa_municipio?: string | null
          empresa_nome?: string
          empresa_uf?: string | null
          endereco?: string | null
          ferias_proporcionais?: number
          ferias_vencidas?: number
          fgts_mes?: number
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          inss?: number
          irrf?: number
          liquido?: number
          liquido_rescisorio?: number | null
          motivo?: string
          multa_fgts?: number
          municipio?: string | null
          nome_mae?: string | null
          observacoes?: string
          outros_descontos?: number
          pensao_fgts?: number | null
          pensao_trct?: number | null
          pis_pasep?: string | null
          remuneracao_mes_anterior?: number | null
          salario_base?: number
          saldo_fgts_depositado?: number
          saldo_salario?: number
          sindicato_cnpj?: string | null
          sindicato_nome?: string | null
          snapshot_json?: Json
          status?: string
          terco_ferias?: number
          tipo_contrato?: string | null
          tipo_rescisao?: string
          total_bruto?: number | null
          total_dedu?: number | null
          total_descontos?: number
          total_proventos?: number
          uf?: string | null
          updated_at?: string
          user_id?: string | null
          usuario_nome?: string
          verba_50_saldo_dias?: number | null
          verba_51_comissoes?: number | null
          verba_52_gratificacao?: number | null
          verba_53_insalubridade?: number | null
          verba_54_periculosidade?: number | null
          verba_55_adic_noturno?: number | null
          verba_56_horas_extras?: number | null
          verba_57_gorjetas?: number | null
          verba_58_dsr?: number | null
          verba_59_reflexo_dsr?: number | null
          verba_60_multa_477?: number | null
          verba_61_multa_479?: number | null
          verba_62_salario_familia?: number | null
          verba_63_13_proporcional?: number | null
          verba_64_13_exercicio?: number | null
          verba_65_ferias_proporcionais?: number | null
          verba_66_ferias_vencidas?: number | null
          verba_68_terco_ferias?: number | null
          verba_69_aviso_indenizado?: number | null
          verba_70_13_sobre_aviso?: number | null
          verba_71_ferias_sobre_aviso?: number | null
        }
        Update: {
          aviso_previo?: string
          aviso_previo_valor?: number
          bairro?: string | null
          cargo?: string
          categoria_trabalhador?: string | null
          causa_afastamento?: string | null
          cep?: string | null
          codigo_afastamento?: string | null
          codigo_sindical?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          ctps?: string | null
          data_admissao?: string | null
          data_aviso?: string | null
          data_desligamento?: string
          data_nascimento?: string | null
          decimo_terceiro?: number
          ded_100_pensao?: number | null
          ded_101_adiantamento?: number | null
          ded_102_adiant_13?: number | null
          ded_103_aviso_indenizado?: number | null
          ded_104_indenizacao_480?: number | null
          ded_105_emprestimo_consig?: number | null
          ded_106_vale_transporte?: number | null
          ded_112_1_inss?: number | null
          ded_112_2_inss_13?: number | null
          ded_114_1_irrf?: number | null
          ded_114_2_irrf_13?: number | null
          ded_115_2_arredondamento?: number | null
          ded_115_3_vale_refeicao?: number | null
          dependentes?: number
          dias_aviso?: number
          empresa_bairro?: string | null
          empresa_cep?: string | null
          empresa_cnae?: string | null
          empresa_cnpj?: string | null
          empresa_endereco?: string | null
          empresa_municipio?: string | null
          empresa_nome?: string
          empresa_uf?: string | null
          endereco?: string | null
          ferias_proporcionais?: number
          ferias_vencidas?: number
          fgts_mes?: number
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          inss?: number
          irrf?: number
          liquido?: number
          liquido_rescisorio?: number | null
          motivo?: string
          multa_fgts?: number
          municipio?: string | null
          nome_mae?: string | null
          observacoes?: string
          outros_descontos?: number
          pensao_fgts?: number | null
          pensao_trct?: number | null
          pis_pasep?: string | null
          remuneracao_mes_anterior?: number | null
          salario_base?: number
          saldo_fgts_depositado?: number
          saldo_salario?: number
          sindicato_cnpj?: string | null
          sindicato_nome?: string | null
          snapshot_json?: Json
          status?: string
          terco_ferias?: number
          tipo_contrato?: string | null
          tipo_rescisao?: string
          total_bruto?: number | null
          total_dedu?: number | null
          total_descontos?: number
          total_proventos?: number
          uf?: string | null
          updated_at?: string
          user_id?: string | null
          usuario_nome?: string
          verba_50_saldo_dias?: number | null
          verba_51_comissoes?: number | null
          verba_52_gratificacao?: number | null
          verba_53_insalubridade?: number | null
          verba_54_periculosidade?: number | null
          verba_55_adic_noturno?: number | null
          verba_56_horas_extras?: number | null
          verba_57_gorjetas?: number | null
          verba_58_dsr?: number | null
          verba_59_reflexo_dsr?: number | null
          verba_60_multa_477?: number | null
          verba_61_multa_479?: number | null
          verba_62_salario_familia?: number | null
          verba_63_13_proporcional?: number | null
          verba_64_13_exercicio?: number | null
          verba_65_ferias_proporcionais?: number | null
          verba_66_ferias_vencidas?: number | null
          verba_68_terco_ferias?: number | null
          verba_69_aviso_indenizado?: number | null
          verba_70_13_sobre_aviso?: number | null
          verba_71_ferias_sobre_aviso?: number | null
        }
        Relationships: []
      }
      tecnicos_campo: {
        Row: {
          access_token: string | null
          apelido: string
          created_at: string
          funcionario_id: string
          id: string
          link_bloqueado: boolean
          link_bloqueado_em: string | null
          link_regenerado_em: string | null
          link_status: string
          observacoes: string | null
          revogado_em: string | null
          revogado_por: string | null
          status: string
          ultima_atividade_em: string | null
          ultimo_acesso_em: string | null
          updated_at: string
          user_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          access_token?: string | null
          apelido?: string
          created_at?: string
          funcionario_id: string
          id?: string
          link_bloqueado?: boolean
          link_bloqueado_em?: string | null
          link_regenerado_em?: string | null
          link_status?: string
          observacoes?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          status?: string
          ultima_atividade_em?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          access_token?: string | null
          apelido?: string
          created_at?: string
          funcionario_id?: string
          id?: string
          link_bloqueado?: boolean
          link_bloqueado_em?: string | null
          link_regenerado_em?: string | null
          link_status?: string
          observacoes?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          status?: string
          ultima_atividade_em?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string
          user_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tecnicos_campo_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: true
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tecnicos_campo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      tecnicos_link_historico: {
        Row: {
          acao: string
          created_at: string
          id: string
          realizado_por: string | null
          realizado_por_nome: string
          tecnico_id: string
          token_anterior: string | null
          token_novo: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          realizado_por?: string | null
          realizado_por_nome?: string
          tecnico_id: string
          token_anterior?: string | null
          token_novo?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          realizado_por?: string | null
          realizado_por_nome?: string
          tecnico_id?: string
          token_anterior?: string | null
          token_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tecnicos_link_historico_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "tecnicos_campo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tecnicos_link_historico_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "tecnicos_campo_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      titulos_pagar: {
        Row: {
          anexo_url: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          competencia: string
          created_at: string
          data_emissao: string
          data_vencimento: string
          desconto: number
          descricao: string
          empresa_id: string
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string
          juros: number
          multa: number
          numero: string | null
          observacoes: string | null
          recorrencia: string | null
          recorrencia_indice: number | null
          recorrencia_total: number | null
          requer_aprovacao: boolean
          saldo: number
          status: string
          updated_at: string
          valor_pago: number
          valor_previsto: number
        }
        Insert: {
          anexo_url?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia: string
          created_at?: string
          data_emissao?: string
          data_vencimento: string
          desconto?: number
          descricao?: string
          empresa_id: string
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          juros?: number
          multa?: number
          numero?: string | null
          observacoes?: string | null
          recorrencia?: string | null
          recorrencia_indice?: number | null
          recorrencia_total?: number | null
          requer_aprovacao?: boolean
          saldo?: number
          status?: string
          updated_at?: string
          valor_pago?: number
          valor_previsto?: number
        }
        Update: {
          anexo_url?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string
          created_at?: string
          data_emissao?: string
          data_vencimento?: string
          desconto?: number
          descricao?: string
          empresa_id?: string
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          juros?: number
          multa?: number
          numero?: string | null
          observacoes?: string | null
          recorrencia?: string | null
          recorrencia_indice?: number | null
          recorrencia_total?: number | null
          requer_aprovacao?: boolean
          saldo?: number
          status?: string
          updated_at?: string
          valor_pago?: number
          valor_previsto?: number
        }
        Relationships: [
          {
            foreignKeyName: "titulos_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_pagar_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_pagar_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      titulos_receber: {
        Row: {
          cliente_id: string
          competencia: string
          conta_bancaria_id: string | null
          contrato_id: string | null
          created_at: string
          data_emissao: string
          data_vencimento: string
          desconto: number
          empresa_id: string
          fatura_id: string | null
          id: string
          juros: number
          multa: number
          numero: string
          observacoes: string | null
          saldo: number
          status: string
          updated_at: string
          valor_original: number
          valor_pago: number
        }
        Insert: {
          cliente_id: string
          competencia: string
          conta_bancaria_id?: string | null
          contrato_id?: string | null
          created_at?: string
          data_emissao?: string
          data_vencimento: string
          desconto?: number
          empresa_id: string
          fatura_id?: string | null
          id?: string
          juros?: number
          multa?: number
          numero: string
          observacoes?: string | null
          saldo?: number
          status?: string
          updated_at?: string
          valor_original?: number
          valor_pago?: number
        }
        Update: {
          cliente_id?: string
          competencia?: string
          conta_bancaria_id?: string | null
          contrato_id?: string | null
          created_at?: string
          data_emissao?: string
          data_vencimento?: string
          desconto?: number
          empresa_id?: string
          fatura_id?: string | null
          id?: string
          juros?: number
          multa?: number
          numero?: string
          observacoes?: string | null
          saldo?: number
          status?: string
          updated_at?: string
          valor_original?: number
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "titulos_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_receber_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_receber_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_receber_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_receber_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_receber_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturamento_conferencia"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          duracao_segundos: number | null
          encerrou_em: string | null
          id: string
          iniciou_em: string
          ip: string | null
          rota_inicial: string
          ultima_atividade_em: string
          ultima_rota: string
          user_agent: string | null
          user_email: string
          user_id: string
          user_nome: string
        }
        Insert: {
          created_at?: string
          duracao_segundos?: number | null
          encerrou_em?: string | null
          id?: string
          iniciou_em?: string
          ip?: string | null
          rota_inicial?: string
          ultima_atividade_em?: string
          ultima_rota?: string
          user_agent?: string | null
          user_email?: string
          user_id: string
          user_nome?: string
        }
        Update: {
          created_at?: string
          duracao_segundos?: number | null
          encerrou_em?: string | null
          id?: string
          iniciou_em?: string
          ip?: string | null
          rota_inicial?: string
          ultima_atividade_em?: string
          ultima_rota?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string
          user_nome?: string
        }
        Relationships: []
      }
      vales_combustivel: {
        Row: {
          codigo: string
          created_at: string
          deleted_at: string | null
          deleted_by_nome: string | null
          emitido_por: string | null
          emitido_por_nome: string
          id: string
          litros_limite: number
          observacao: string
          posto_cnpj: string
          posto_endereco: string
          posto_id: string | null
          posto_nome: string
          status: string
          tecnico_id: string | null
          tipo: string
          updated_at: string
          utilizado_em: string | null
          utilizado_por: string | null
          validade: string | null
          valor_limite: number
          veiculo_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_nome?: string | null
          emitido_por?: string | null
          emitido_por_nome?: string
          id?: string
          litros_limite?: number
          observacao?: string
          posto_cnpj?: string
          posto_endereco?: string
          posto_id?: string | null
          posto_nome?: string
          status?: string
          tecnico_id?: string | null
          tipo?: string
          updated_at?: string
          utilizado_em?: string | null
          utilizado_por?: string | null
          validade?: string | null
          valor_limite?: number
          veiculo_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_nome?: string | null
          emitido_por?: string | null
          emitido_por_nome?: string
          id?: string
          litros_limite?: number
          observacao?: string
          posto_cnpj?: string
          posto_endereco?: string
          posto_id?: string | null
          posto_nome?: string
          status?: string
          tecnico_id?: string | null
          tipo?: string
          updated_at?: string
          utilizado_em?: string | null
          utilizado_por?: string | null
          validade?: string | null
          valor_limite?: number
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vales_combustivel_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          created_at: string
          id: string
          identificacao_interna: string | null
          modelo: string
          placa: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identificacao_interna?: string | null
          modelo?: string
          placa: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identificacao_interna?: string | null
          modelo?: string
          placa?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      tecnicos_campo_safe: {
        Row: {
          apelido: string | null
          created_at: string | null
          funcionario_id: string | null
          id: string | null
          link_bloqueado: boolean | null
          link_bloqueado_em: string | null
          link_regenerado_em: string | null
          link_status: string | null
          observacoes: string | null
          revogado_em: string | null
          revogado_por: string | null
          status: string | null
          ultima_atividade_em: string | null
          ultimo_acesso_em: string | null
          updated_at: string | null
          user_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          apelido?: string | null
          created_at?: string | null
          funcionario_id?: string | null
          id?: string | null
          link_bloqueado?: boolean | null
          link_bloqueado_em?: string | null
          link_regenerado_em?: string | null
          link_status?: string | null
          observacoes?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          status?: string | null
          ultima_atividade_em?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string | null
          user_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          apelido?: string | null
          created_at?: string | null
          funcionario_id?: string | null
          id?: string | null
          link_bloqueado?: boolean | null
          link_bloqueado_em?: string | null
          link_regenerado_em?: string | null
          link_status?: string | null
          observacoes?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          status?: string | null
          ultima_atividade_em?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string | null
          user_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tecnicos_campo_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: true
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tecnicos_campo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_faturamento_conferencia: {
        Row: {
          cliente_doc: string | null
          cliente_nome: string | null
          competencia: string | null
          contrato_numero: string | null
          data_emissao: string | null
          data_vencimento: string | null
          dia_vencimento: number | null
          empresa_nome: string | null
          id: string | null
          medicao_id: string | null
          numero: string | null
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string | null
          total: number | null
          valor_pago: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acesso_externo_obter: {
        Args: { p_id: string; p_modulo: string }
        Returns: Json
      }
      acesso_externo_validar_pin: {
        Args: { p_modulo: string; p_pin: string }
        Returns: Json
      }
      calc_inss: { Args: { p_base: number }; Returns: number }
      calc_irrf: { Args: { p_base: number }; Returns: number }
      dashboard_faturamento_kpis: { Args: never; Returns: Json }
      faturamento_gerar_medicoes_mes: {
        Args: { p_competencia?: string }
        Returns: number
      }
      faturamento_marcar_vencidas: { Args: never; Returns: number }
      fechamento_filial_breakdown: {
        Args: { p_company_id: string; p_competencia: string }
        Returns: Json
      }
      fechamento_filial_executar: {
        Args: {
          p_company_id: string
          p_competencia: string
          p_user_id: string
          p_user_nome: string
        }
        Returns: Json
      }
      fechamento_filial_reabrir: {
        Args: {
          p_fechamento_id: string
          p_motivo: string
          p_user_id: string
          p_user_nome: string
        }
        Returns: Json
      }
      fechamento_filial_sincronizar: {
        Args: { p_company_id: string; p_competencia: string }
        Returns: Json
      }
      gen_tecnico_access_token: { Args: never; Returns: string }
      gerar_proxima_medicao: {
        Args: { p_competencia?: string; p_contrato_id: string }
        Returns: string
      }
      get_user_empresas: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      qr_abastecimento_dados: { Args: { p_codigo: string }; Returns: Json }
      registrar_abastecimento_publico: {
        Args: {
          p_codigo: string
          p_combustivel: string
          p_cpf: string
          p_foto_bomba_url: string
          p_foto_painel_url: string
          p_km: number
          p_litros: number
          p_placa: string
          p_valor: number
        }
        Returns: Json
      }
      validar_qr_combustivel_publico: {
        Args: { p_codigo: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "filial_praia"
        | "filial_goiania"
        | "almoxarifado"
        | "usuario"
        | "tecnico_campo"
        | "operacional"
        | "faturamento"
        | "financeiro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "filial_praia",
        "filial_goiania",
        "almoxarifado",
        "usuario",
        "tecnico_campo",
        "operacional",
        "faturamento",
        "financeiro",
      ],
    },
  },
} as const
