-- Recria a view sem SECURITY DEFINER (usa security_invoker)
DROP VIEW IF EXISTS public.vw_faturamento_conferencia;

CREATE VIEW public.vw_faturamento_conferencia
WITH (security_invoker = true) AS
SELECT
  f.id, f.numero, f.competencia, f.data_emissao, f.data_vencimento, f.total, f.valor_pago,
  f.status, f.observacoes,
  c.numero AS contrato_numero, c.dia_vencimento,
  cl.razao_social AS cliente_nome, cl.cnpj_cpf AS cliente_doc,
  e.nome AS empresa_nome,
  m.id AS medicao_id, m.data_inicio AS periodo_inicio, m.data_fim AS periodo_fim
FROM public.faturas f
LEFT JOIN public.contratos c ON c.id = f.contrato_id
LEFT JOIN public.clientes_fat cl ON cl.id = f.cliente_id
LEFT JOIN public.empresas e ON e.id = f.empresa_id
LEFT JOIN public.medicoes m ON m.id = f.medicao_id;

GRANT SELECT ON public.vw_faturamento_conferencia TO authenticated;

-- Restringe execução das novas funções a usuários autenticados
REVOKE EXECUTE ON FUNCTION public.gerar_proxima_medicao(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faturamento_marcar_vencidas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_faturamento_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faturamento_gerar_medicoes_mes(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gerar_proxima_medicao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.faturamento_marcar_vencidas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_faturamento_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.faturamento_gerar_medicoes_mes(text) TO authenticated;