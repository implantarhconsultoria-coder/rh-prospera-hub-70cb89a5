import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPreviousCompetencia, type BenefitMedicalLeave } from '@/lib/benefitReports';

type MedicalState = {
  competencia: string;
  loading: boolean;
  error: string | null;
  atestados: BenefitMedicalLeave[];
  documentosPendentes: number;
  pendentesPorEmpresa: Record<string, number>;
  pendentesPorFuncionario: Record<string, number>;
};

const bounds = (competencia: string) => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || month < 1 || month > 12) return null;
  const first = `${competencia}-01`;
  const last = `${competencia}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { first, last, next };
};

/**
 * Os documentos antigos sem intervalo conferido são pendências, jamais abatimentos.
 * O cálculo usa exclusivamente a tabela de atestados com datas, status e aplicação explícita.
 */
export const useBenefitMedicalLeaves = (competencia: string) => {
  const [state, setState] = useState<MedicalState>({
    competencia: '',
    loading: true,
    error: null,
    atestados: [],
    documentosPendentes: 0,
    pendentesPorEmpresa: {},
    pendentesPorFuncionario: {},
  });

  useEffect(() => {
    const anterior = getPreviousCompetencia(competencia);
    const period = bounds(anterior);
    if (!period) {
      setState({ competencia, loading: false, error: null, atestados: [], documentosPendentes: 0, pendentesPorEmpresa: {}, pendentesPorFuncionario: {} });
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    void (async () => {
      try {
        const [atestadosResult, documentsResult] = await Promise.all([
          supabase.from('atestados')
            .select('funcionario_id,company_id,data_inicio,data_fim,status,aplicado_vr,aplicado_vt,arquivo_url')
            .lte('data_inicio', period.last)
            .gte('data_fim', period.first),
          supabase.from('documentos_funcionario')
            .select('funcionario_id,company_id,arquivo_url')
            .ilike('tipo_documento', '%ATESTADO%')
            .gte('data_documento', `${period.first}T00:00:00-03:00`)
            .lt('data_documento', `${period.next}T00:00:00-03:00`),
        ]);
        if (atestadosResult.error) throw atestadosResult.error;
        if (documentsResult.error) throw documentsResult.error;

        const medicalRecords = atestadosResult.data || [];
        const confirmedUrls = new Set(medicalRecords
          .filter(a => a.status === 'confirmado' && a.data_inicio && a.data_fim)
          .map(a => a.arquivo_url).filter(Boolean));
        const pendingDocuments = (documentsResult.data || [])
          .filter(d => !d.arquivo_url || !confirmedUrls.has(d.arquivo_url));
        const pendingDocs = pendingDocuments.length;
        const pendentesPorEmpresa: Record<string, number> = {};
        const pendentesPorFuncionario: Record<string, number> = {};
        pendingDocuments.forEach(d => {
          if (d.company_id) pendentesPorEmpresa[d.company_id] = (pendentesPorEmpresa[d.company_id] || 0) + 1;
          if (d.funcionario_id) pendentesPorFuncionario[d.funcionario_id] = (pendentesPorFuncionario[d.funcionario_id] || 0) + 1;
        });
        const atestados: BenefitMedicalLeave[] = medicalRecords
          .filter(a => a.funcionario_id && a.company_id && a.data_inicio && a.data_fim)
          .map(a => ({
            employeeId: a.funcionario_id,
            companyId: a.company_id,
            dataInicio: a.data_inicio!,
            dataFim: a.data_fim!,
            status: a.status || '',
            aplicarVR: a.aplicado_vr === true,
            aplicarVT: a.aplicado_vt === true,
          }));
        if (!cancelled) setState({
          competencia, loading: false, error: null, atestados, documentosPendentes: pendingDocs,
          pendentesPorEmpresa, pendentesPorFuncionario,
        });
      } catch (error: any) {
        if (!cancelled) setState({
          competencia, loading: false, error: error?.message || 'Erro ao consultar atestados.',
          atestados: [], documentosPendentes: 0,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [competencia]);

  return {
    ...state,
    loading: state.loading || state.competencia !== competencia,
  };
};
