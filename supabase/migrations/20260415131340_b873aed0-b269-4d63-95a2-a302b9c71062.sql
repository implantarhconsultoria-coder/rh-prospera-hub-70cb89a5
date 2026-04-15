
-- Fix almoxarifado_itens
DROP POLICY "Authenticated users can manage itens" ON public.almoxarifado_itens;
CREATE POLICY "Users can view itens" ON public.almoxarifado_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert itens" ON public.almoxarifado_itens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update itens" ON public.almoxarifado_itens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete itens" ON public.almoxarifado_itens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix almoxarifado_entradas
DROP POLICY "Authenticated users can manage entradas" ON public.almoxarifado_entradas;
CREATE POLICY "Users can view entradas" ON public.almoxarifado_entradas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert entradas" ON public.almoxarifado_entradas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update entradas" ON public.almoxarifado_entradas FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete entradas" ON public.almoxarifado_entradas FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix almoxarifado_saidas
DROP POLICY "Authenticated users can manage saidas" ON public.almoxarifado_saidas;
CREATE POLICY "Users can view saidas" ON public.almoxarifado_saidas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert saidas" ON public.almoxarifado_saidas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update saidas" ON public.almoxarifado_saidas FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete saidas" ON public.almoxarifado_saidas FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix aso_agendamentos
DROP POLICY "Authenticated users can manage agendamentos" ON public.aso_agendamentos;
CREATE POLICY "Users can view agendamentos" ON public.aso_agendamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert agendamentos" ON public.aso_agendamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update agendamentos" ON public.aso_agendamentos FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete agendamentos" ON public.aso_agendamentos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix prestadores
DROP POLICY "Authenticated users can manage prestadores" ON public.prestadores;
CREATE POLICY "Users can view prestadores" ON public.prestadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert prestadores" ON public.prestadores FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update prestadores" ON public.prestadores FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete prestadores" ON public.prestadores FOR DELETE TO authenticated USING (auth.uid() = user_id);
