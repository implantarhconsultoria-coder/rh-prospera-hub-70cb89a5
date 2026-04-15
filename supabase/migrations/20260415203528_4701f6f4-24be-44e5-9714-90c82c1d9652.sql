
-- Veículos
CREATE TABLE public.veiculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placa TEXT NOT NULL,
  modelo TEXT NOT NULL DEFAULT '',
  identificacao_interna TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view veiculos" ON public.veiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage veiculos" ON public.veiculos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can manage veiculos" ON public.veiculos FOR ALL TO authenticated USING (has_role(auth.uid(), 'operacional')) WITH CHECK (has_role(auth.uid(), 'operacional'));
CREATE TRIGGER update_veiculos_updated_at BEFORE UPDATE ON public.veiculos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Colaborador ↔ Veículo
CREATE TABLE public.colaborador_veiculo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.colaborador_veiculo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own veiculo" ON public.colaborador_veiculo FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage colaborador_veiculo" ON public.colaborador_veiculo FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can manage colaborador_veiculo" ON public.colaborador_veiculo FOR ALL TO authenticated USING (has_role(auth.uid(), 'operacional')) WITH CHECK (has_role(auth.uid(), 'operacional'));

-- Registros de Ponto
CREATE TABLE public.registros_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  endereco_formatado TEXT DEFAULT '',
  veiculo_id UUID REFERENCES public.veiculos(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ponto" ON public.registros_ponto FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ponto" ON public.registros_ponto FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all ponto" ON public.registros_ponto FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can view all ponto" ON public.registros_ponto FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operacional'));

-- Chamados
CREATE TABLE public.chamados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente TEXT NOT NULL DEFAULT '',
  local_servico TEXT NOT NULL DEFAULT '',
  tipo_servico TEXT NOT NULL DEFAULT '',
  itens_previstos TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  info_adicional TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  colaborador_id UUID,
  veiculo_id UUID REFERENCES public.veiculos(id),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  aceito_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_por UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Colaborador can view own chamados" ON public.chamados FOR SELECT TO authenticated USING (auth.uid() = colaborador_id);
CREATE POLICY "Colaborador can update own chamados" ON public.chamados FOR UPDATE TO authenticated USING (auth.uid() = colaborador_id);
CREATE POLICY "Admins can manage chamados" ON public.chamados FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can manage chamados" ON public.chamados FOR ALL TO authenticated USING (has_role(auth.uid(), 'operacional')) WITH CHECK (has_role(auth.uid(), 'operacional'));
CREATE TRIGGER update_chamados_updated_at BEFORE UPDATE ON public.chamados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chamado itens utilizados
CREATE TABLE public.chamado_itens_utilizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chamado_id UUID NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  nome_item TEXT NOT NULL DEFAULT '',
  quantidade NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chamado_itens_utilizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view chamado_itens via chamado" ON public.chamado_itens_utilizados FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.chamados c WHERE c.id = chamado_id AND (c.colaborador_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operacional')))
);
CREATE POLICY "Users can insert chamado_itens" ON public.chamado_itens_utilizados FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.chamados c WHERE c.id = chamado_id AND (c.colaborador_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operacional')))
);

-- Estoque do Veículo
CREATE TABLE public.estoque_veiculo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  nome_item TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_veiculo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tecnico can view own veiculo estoque" ON public.estoque_veiculo FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.colaborador_veiculo cv WHERE cv.veiculo_id = estoque_veiculo.veiculo_id AND cv.user_id = auth.uid())
);
CREATE POLICY "Tecnico can insert own veiculo estoque" ON public.estoque_veiculo FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.colaborador_veiculo cv WHERE cv.veiculo_id = estoque_veiculo.veiculo_id AND cv.user_id = auth.uid())
);
CREATE POLICY "Tecnico can update own veiculo estoque" ON public.estoque_veiculo FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.colaborador_veiculo cv WHERE cv.veiculo_id = estoque_veiculo.veiculo_id AND cv.user_id = auth.uid())
);
CREATE POLICY "Tecnico can delete own veiculo estoque" ON public.estoque_veiculo FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.colaborador_veiculo cv WHERE cv.veiculo_id = estoque_veiculo.veiculo_id AND cv.user_id = auth.uid())
);
CREATE POLICY "Admins can manage all estoque" ON public.estoque_veiculo FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can manage all estoque" ON public.estoque_veiculo FOR ALL TO authenticated USING (has_role(auth.uid(), 'operacional')) WITH CHECK (has_role(auth.uid(), 'operacional'));
CREATE TRIGGER update_estoque_veiculo_updated_at BEFORE UPDATE ON public.estoque_veiculo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registros de KM
CREATE TABLE public.registros_km (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id),
  km_valor NUMERIC NOT NULL,
  tipo_registro TEXT NOT NULL DEFAULT 'manual',
  foto_url TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registros_km ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own km" ON public.registros_km FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own km" ON public.registros_km FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all km" ON public.registros_km FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Operacional can view all km" ON public.registros_km FOR SELECT TO authenticated USING (has_role(auth.uid(), 'operacional'));

-- Storage bucket for KM photos
INSERT INTO storage.buckets (id, name, public) VALUES ('km-fotos', 'km-fotos', true);
CREATE POLICY "Users can upload km fotos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'km-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Public can view km fotos" ON storage.objects FOR SELECT USING (bucket_id = 'km-fotos');

-- Enable realtime for chamados
ALTER PUBLICATION supabase_realtime ADD TABLE public.chamados;
