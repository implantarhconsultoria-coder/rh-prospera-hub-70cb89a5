import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPreviousCompetencia, type BenefitMedicalLeave } from '@/lib/benefitReports';
import { detectarDuracaoAtestado } from '@/lib/medicalEvidence';

type MedicalState = {
  competencia: string;
  loading: boolean;
  error: string | null;
  atestados: BenefitMedicalLeave[];
  documentosPendentes: number;
  documentosEmHoras: number;
  documentosEmDias: number;
  documentosSemDuracao: number;
  documentosContabilidade: number;
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
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onUpdate = () => setRevision(value => value + 1);
    window.addEventListener('topac:medical-updated', onUpdate);
    return () => window.removeEventListener('topac:medical-updated', onUpdate);
  }, []);
  const [state, setState] = useState<MedicalState>({
    competencia: '',
    loading: true,
    error: null,
    atestados: [],
    documentosPendentes: 0,
    documentosEmHoras: 0,
    documentosEmDias: 0,
    documentosSemDuracao: 0,
    documentosContabilidade: 0,
    pendentesPorEmpresa: {},
    pendentesPorFuncionario: {},
  });

  useEffect(() => {
    const anterior = getPreviousCompetencia(competencia);
    const period = bounds(anterior);
    if (!period) {
      setState({ competencia, loading: false, error: null, atestados: [], documentosPendentes: 0, documentosEmHoras: 0, documentosEmDias: 0, documentosSemDuracao: 0, documentosContabilidade: 0, pendentesPorEmpresa: {}, pendentesPorFuncionario: {} });
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    void (async () => {
      try {
        const [atestadosResult, documentsResult, accountingResult] = await Promise.all([
          supabase.from('atestados')
            .select('funcionario_id,company_id,data_inicio,data_fim,status,aplicado_vr,aplicado_vt,arquivo_url')
            .lte('data_inicio', period.last)
            .gte('data_fim', period.first),
          supabase.from('documentos_funcionario')
            .select('funcionario_id,company_id,arquivo_url,storage_bucket,storage_path,tipo_documento,descricao,observacao,data_documento,created_at')
            .or('tipo_documento.ilike.%ATESTADO%,tipo_documento.ilike.%DECLARA%')
            .gte('data_documento', `${period.first}T00:00:00-03:00`)
            // Recebimento até dois dias depois da competência exige revisão; nunca cria abatimento.
            .lt('data_documento', new Date(Date.parse(`${period.next}T00:00:00-03:00`) + 2 * 86400000).toISOString()),
          supabase.from('contabilidade_folha_documentos')
            .select('funcionario_id,empresa_id,tipo_documento,classificacao,detalhes,created_at')
            .gte('created_at', `${period.first}T00:00:00-03:00`)
            .lt('created_at', new Date(Date.parse(`${period.next}T00:00:00-03:00`) + 2 * 86400000).toISOString()),
        ]);
        if (atestadosResult.error) throw atestadosResult.error;
        if (documentsResult.error) throw documentsResult.error;
        if (accountingResult.error) throw accountingResult.error;

        const medicalRecords = atestadosResult.data || [];
        const confirmedUrls = new Set(medicalRecords
          .filter(a => a.status === 'confirmado' && a.data_inicio && a.data_fim)
          .map(a => a.arquivo_url).filter(Boolean));
        // Documentos antigos só possuem o caminho privado no Storage, sem URL pública.
        const pendingDocuments = (documentsResult.data || []).filter(d => {
          const original = d.arquivo_url || (d.storage_bucket && d.storage_path
            ? `storage://${d.storage_bucket}/${d.storage_path}` : '');
          return !original || !confirmedUrls.has(original);
        });
        const pendingDocs = pendingDocuments.length;
        const duracoes = pendingDocuments.map(d => detectarDuracaoAtestado([d.descricao, d.observacao].filter(Boolean).join(' ')));
        const documentosEmHoras = duracoes.filter(d => d.unidade === 'horas').length;
        const documentosEmDias = duracoes.filter(d => d.unidade === 'dias').length;
        const documentosSemDuracao = duracoes.filter(d => d.unidade === 'indefinido').length;
        // A folha da contabilidade serve como fonte de conferência complementar.
        const documentosContabilidade = (accountingResult.data || []).filter(d =>
          /atestado|declaracao|declaração/i.test([d.tipo_documento, d.classificacao, JSON.stringify(d.detalhes || {})].join(' '))).length;
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
          documentosEmHoras, documentosEmDias, documentosSemDuracao, documentosContabilidade,
          pendentesPorEmpresa, pendentesPorFuncionario,
        });
      } catch (error: any) {
        if (!cancelled) setState({
          competencia, loading: false, error: error?.message || 'Erro ao consultar atestados.',
          atestados: [], documentosPendentes: 0,
          documentosEmHoras: 0, documentosEmDias: 0, documentosSemDuracao: 0, documentosContabilidade: 0,
          pendentesPorEmpresa: {}, pendentesPorFuncionario: {},
        });
      }
    })();
    return () => { cancelled = true; };
  }, [competencia, revision]);

  return {
    ...state,
    loading: state.loading || state.competencia !== competencia,
  };
};
