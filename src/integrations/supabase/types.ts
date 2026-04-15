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
          categoria: string | null
          codigo_sku: string | null
          created_at: string
          descricao: string | null
          id: string
          localizacao: string | null
          nome: string
          quantidade: number
          unidade: string
          updated_at: string
          user_id: string
          valor_unitario: number | null
        }
        Insert: {
          categoria?: string | null
          codigo_sku?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao?: string | null
          nome: string
          quantidade?: number
          unidade?: string
          updated_at?: string
          user_id: string
          valor_unitario?: number | null
        }
        Update: {
          categoria?: string | null
          codigo_sku?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao?: string | null
          nome?: string
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
          observacao: string | null
          patrimonio: string | null
          placa: string | null
          renavam: string | null
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
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          renavam?: string | null
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
          observacao?: string | null
          patrimonio?: string | null
          placa?: string | null
          renavam?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          vencimento_ipva?: string | null
          vencimento_licenciamento?: string | null
        }
        Relationships: []
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
      funcionarios: {
        Row: {
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
      lancamentos_mensais: {
        Row: {
          adiantamento: number
          adicionais: number
          atrasos: number
          comissao_base: number
          company_id: string
          competencia: string
          created_at: string
          descontos_diversos: number
          faltas_dias: number
          funcionario_id: string
          he100: number
          he50: number
          id: string
          insalubridade_aplicada: boolean
          observacoes: string
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
          atrasos?: number
          comissao_base?: number
          company_id: string
          competencia: string
          created_at?: string
          descontos_diversos?: number
          faltas_dias?: number
          funcionario_id: string
          he100?: number
          he50?: number
          id?: string
          insalubridade_aplicada?: boolean
          observacoes?: string
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
          atrasos?: number
          comissao_base?: number
          company_id?: string
          competencia?: string
          created_at?: string
          descontos_diversos?: number
          faltas_dias?: number
          funcionario_id?: string
          he100?: number
          he50?: number
          id?: string
          insalubridade_aplicada?: boolean
          observacoes?: string
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
            foreignKeyName: "lancamentos_mensais_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      get_user_empresas: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      ],
    },
  },
} as const
