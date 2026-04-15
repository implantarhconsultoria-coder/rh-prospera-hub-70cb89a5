
-- Enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'filial_praia', 'filial_goiania', 'almoxarifado', 'usuario');

-- Tabela user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função segura para checar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Almoxarifado: Itens
CREATE TABLE public.almoxarifado_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria TEXT DEFAULT '',
  codigo_sku TEXT DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'un',
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_unitario NUMERIC DEFAULT 0,
  descricao TEXT DEFAULT '',
  localizacao TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.almoxarifado_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage itens" ON public.almoxarifado_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_almoxarifado_itens_updated_at
  BEFORE UPDATE ON public.almoxarifado_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Almoxarifado: Entradas
CREATE TABLE public.almoxarifado_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.almoxarifado_itens(id) ON DELETE CASCADE,
  quantidade NUMERIC NOT NULL,
  fornecedor TEXT DEFAULT '',
  valor_unitario NUMERIC DEFAULT 0,
  valor_total NUMERIC DEFAULT 0,
  observacao TEXT DEFAULT '',
  nota_fiscal_url TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.almoxarifado_entradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage entradas" ON public.almoxarifado_entradas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Almoxarifado: Saídas
CREATE TABLE public.almoxarifado_saidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.almoxarifado_itens(id) ON DELETE CASCADE,
  quantidade NUMERIC NOT NULL,
  funcionario_nome TEXT NOT NULL,
  motivo TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.almoxarifado_saidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage saidas" ON public.almoxarifado_saidas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ASO Agendamentos
CREATE TABLE public.aso_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL,
  funcionario_nome TEXT NOT NULL,
  funcao TEXT DEFAULT '',
  data_exame DATE,
  obra_local TEXT DEFAULT '',
  data_nascimento DATE,
  rg TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  data_admissao DATE,
  pis TEXT DEFAULT '',
  ctps TEXT DEFAULT '',
  tipo_exame TEXT NOT NULL DEFAULT 'periodico',
  trabalho_altura BOOLEAN DEFAULT false,
  espaco_confinado BOOLEAN DEFAULT false,
  responsavel_contato TEXT DEFAULT '',
  clinica_endereco TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  observacao TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aso_agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage agendamentos" ON public.aso_agendamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_aso_agendamentos_updated_at
  BEFORE UPDATE ON public.aso_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Prestadores
CREATE TABLE public.prestadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT DEFAULT '',
  funcao TEXT DEFAULT '',
  empresa_pagadora TEXT NOT NULL DEFAULT 'ALQUI OBRAS',
  dias_trabalho TEXT DEFAULT 'segunda,quinta',
  pagamento_tipo TEXT NOT NULL DEFAULT 'quinzenal',
  valor_diario NUMERIC DEFAULT 0,
  observacao TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativo',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prestadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage prestadores" ON public.prestadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_prestadores_updated_at
  BEFORE UPDATE ON public.prestadores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
