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
        }
        Relationships: []
      }
      prestadores: {
        Row: {
          cpf: string | null
          created_at: string
          dias_trabalho: string | null
          empresa_pagadora: string
          funcao: string | null
          id: string
          nome: string
          observacao: string | null
          pagamento_tipo: string
          status: string
          updated_at: string
          user_id: string
          valor_diario: number | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          dias_trabalho?: string | null
          empresa_pagadora?: string
          funcao?: string | null
          id?: string
          nome: string
          observacao?: string | null
          pagamento_tipo?: string
          status?: string
          updated_at?: string
          user_id: string
          valor_diario?: number | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          dias_trabalho?: string | null
          empresa_pagadora?: string
          funcao?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          pagamento_tipo?: string
          status?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      ],
    },
  },
} as const
