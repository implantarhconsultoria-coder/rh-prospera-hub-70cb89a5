import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, FileCheck, LinkIcon, Loader2, MessageSquareText, Printer, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchPdfBytes, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcao } from '@/lib/acoesLog';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import { formalizarOperacaoPorEmail } from '@/lib/operacionalFormalizacao';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { toast } from 'sonner';
import { createProtocolPrintJobs } from '@/lib/protocoloPrintPlan';

interface AtivoDoc {
  id: string;
  tipo?: string | null;
  descricao?: string | null;
  placa?: string | null;
  patrimonio?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  empresa?: string | null;
  arquivo_url?: string | null;
  documento_url?: string | null;
  documento_nome?: string | null;
  observacao?: string | null;
}

interface ParsedItem {
  placa: string;
  patrimonio: string;
  descricao: string;
}

interface ProtocolItem extends ParsedItem {
  ativo: AtivoDoc | null;
}

interface ProtocolGroup {
  key: string;
  cliente: string;
  local: string;
  responsavel: string;
  observacao: string;
  substituicaoSaiId: string;
  substituicaoEntraId: string;
  itens: ProtocolItem[];
}

const PROTOCOL_PARSE_ENDPOINT = '/api/protocolos-parse';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizePlate = (value: unknown) =>
  normalize(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';

const normalizePatrimonio = (value: unknown) =>
  normalize(value).replace(/\s+/g, '').replace(/[^A-Z0-9./-]/g, '');

const compactToken = (value: unknown) => normalize(value).replace(/[^A-Z0-9]/g, '');

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const pdfOf = (asset: AtivoDoc | null) => String(asset?.documento_url || asset?.arquivo_url || '').trim();

const findVehicleByPlate = (assets: AtivoDoc[], plate: unknown) => {
  const normalized = normalizePlate(plate);
  return normalized ? assets.find((asset) => normalizePlate(asset.placa) === normalized) || null : null;
};

const toProtocolVehicleFields = (asset: AtivoDoc | null) => ({
  descricao_ativo: asset?.descricao || null,
  placa: normalizePlate(asset?.placa) || null,
  renavam: asset?.renavam || null,
  chassi: asset?.chassi || null,
  ano_fabricacao: asset?.ano_fabricacao || null,
  ano_modelo: asset?.ano_modelo || null,
  patrimonio: asset?.patrimonio || null,
  pdf_url: pdfOf(asset) || null,
  ativo_id: asset?.id || null,
});

const itemLabel = (item?: ProtocolItem | null) => {
  if (!item) return 'Não informado';
  const asset = item.ativo;
  const patrimonio = asset?.patrimonio || item.patrimonio || 'sem patrimônio';
  const placa = normalizePlate(asset?.placa || item.placa);
  const descricao = asset?.descricao || item.descricao || 'Equipamento';
  return `${patrimonio}${placa ? ` / ${placa}` : ''} — ${descricao}`;
};

const inferSubstitution = (items: ProtocolItem[], sourceText: string) => {
  const normalizedText = normalize(sourceText);
  const marker = normalizedText.search(/SUBSTITU/);
  if (marker < 0 || items.length < 2) return { sai: '', entra: '' };

  const context = compactToken(normalizedText.slice(marker, marker + 180));
  const outgoing = items.find((item) => {
    const patrimonio = compactToken(item.ativo?.patrimonio || item.patrimonio);
    const placa = compactToken(normalizePlate(item.ativo?.placa || item.placa));
    return Boolean((patrimonio && context.includes(patrimonio)) || (placa && context.includes(placa)));
  });

  const sai = outgoing?.ativo?.id || '';
  const entra = items.length === 2
    ? items.find((item) => item.ativo?.id && item.ativo.id !== sai)?.ativo?.id || ''
    : '';

  return { sai, entra };
};

const ProtocoloPage: React.FC = () => {
  const { companies, session } = useApp();
  const { developerMode } = useDeveloperMode();
  const [searchParams] = useSearchParams();
  const isLocacaoFlow = searchParams.get('acao') === 'locacao';
  const placaInicial = normalizePlate(searchParams.get('placa'));
  const topac = companies.find((company) => company.id === 'topac-matriz');

  const [textoColado, setTextoColado] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [ativos, setAtivos] = useState<AtivoDoc[]>([]);
  const [groups, setGroups] = useState<ProtocolGroup[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastSavedIds, setLastSavedIds] = useState<string[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Record<string, string>>({});
  const [codigoOpen, setCodigoOpen] = useState(false);
  const [codigoLoading, setCodigoLoading] = useState(false);
  const [codigoAction, setCodigoAction] = useState<'save' | 'print' | null>(null);

  const loadAssets = async (): Promise<AtivoDoc[]> => {
    setLoadingAssets(true);
    try {
      const { data, error } = await supabase
        .from('ativos')
        .select('id,tipo,descricao,placa,patrimonio,renavam,chassi,ano_fabricacao,ano_modelo,empresa,arquivo_url,documento_url,documento_nome,observacao')
        .in('tipo', ['veiculo', 'equipamento'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = ((data as unknown as AtivoDoc[]) || []);
      setAtivos(list);
      return list;
    } catch (error: any) {
      setAtivos([]);
      toast.error(`Não foi possível carregar a Frota do Supabase: ${error?.message || error}`);
      return [];
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    void loadAssets();
    void (async () => {
      const { data, error } = await rpc.rpc('operacional_consultar_placas', { p_busca: null });
      if (!error && data?.ok) {
        const map: Record<string, string> = {};
        (data.placas || []).forEach((row: any) => { map[normalizePlate(row.placa)] = row.status; });
        setDisponibilidades(map);
      }
    })();
  }, []);

  useEffect(() => {
    if (!placaInicial || textoColado.trim()) return;
    setTextoColado(`PLACA ${placaInicial} — NOVA LOCAÇÃO\nCliente: \nLocal / Canteiro: \nResponsável: `);
  }, [placaInicial]);

  const resolveAsset = (item: ParsedItem, pool: AtivoDoc[] = ativos) => {
    const plate = normalizePlate(item.placa);
    const patrimonio = normalizePatrimonio(item.patrimonio);

    if (plate) {
      const byPlate = findVehicleByPlate(pool, plate);
      if (byPlate) return byPlate;
    }

    if (patrimonio) {
      const byPatrimonio = pool.find((asset) => normalizePatrimonio(asset.patrimonio) === patrimonio);
      if (byPatrimonio) return byPatrimonio;
    }

    return null;
  };

  const processSmartMessage = async () => {
    if (!textoColado.trim()) {
      toast.error('Cole ou digite a mensagem antes de processar.');
      return;
    }
    if (!session?.access_token) {
      toast.error('Sessão expirada. Entre novamente.');
      return;
    }

    setParsing(true);
    try {
      const freshAssets = await loadAssets();
      const response = await fetch(PROTOCOL_PARSE_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: textoColado }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível interpretar a mensagem.');

      const nextGroups: ProtocolGroup[] = (payload.groups || []).map((group: any, index: number) => {
        const itens: ProtocolItem[] = (group.itens || []).map((item: ParsedItem) => ({
          placa: normalizePlate(item.placa),
          patrimonio: String(item.patrimonio || '').trim(),
          descricao: String(item.descricao || '').trim(),
          ativo: resolveAsset(item, freshAssets),
        }));
        const inferred = inferSubstitution(itens, textoColado);
        return {
          key: `${Date.now()}-${index}`,
          cliente: String(group.cliente || '').trim(),
          local: String(group.local || '').trim(),
          responsavel: String(group.responsavel || '').trim(),
          observacao: '',
          substituicaoSaiId: inferred.sai,
          substituicaoEntraId: inferred.entra,
          itens,
        };
      });

      if (!nextGroups.length) throw new Error('Nenhum grupo Cliente + Local foi identificado.');

      setGroups(nextGroups);
      setLastSavedIds([]);

      const missing = nextGroups
        .flatMap((group) => group.itens)
        .filter((item) => !item.ativo || !pdfOf(item.ativo)).length;

      if (missing > 0) {
        toast.error(`${missing} ativo(s) estão com Documento Faltando. A impressão foi bloqueada.`);
      } else {
        const inferredCount = nextGroups.filter((group) => group.substituicaoSaiId && group.substituicaoEntraId).length;
        toast.success(`${nextGroups.reduce((total, group) => total + group.itens.length, 0)} protocolo(s) individual(is) em ${nextGroups.length} destino(s)${inferredCount ? ` • ${inferredCount} substituição(ões) sugerida(s)` : ''}.`);
      }
    } catch (error: any) {
      setGroups([]);
      toast.error(error?.message || 'Não foi possível processar a mensagem.');
    } finally {
      setParsing(false);
    }
  };

  const updateGroup = (
    key: string,
    field: 'cliente' | 'local' | 'responsavel' | 'observacao' | 'substituicaoSaiId' | 'substituicaoEntraId',
    value: string,
  ) => {
    setGroups((current) => current.map((group) => group.key === key ? { ...group, [field]: value } : group));
  };

  const relink = async () => {
    const freshAssets = await loadAssets();
    setGroups((current) => current.map((group) => ({
      ...group,
      itens: group.itens.map((item) => ({ ...item, ativo: resolveAsset(item, freshAssets) })),
    })));
    toast.success('Documentos conferidos novamente no Supabase Storage.');
  };

  const readiness = useMemo(() => {
    const items = groups.flatMap((group) => group.itens);
    const missingContext = groups.filter((group) => !group.cliente.trim() || !group.local.trim()).length;
    const missingDocs = items.filter((item) => !item.ativo || !pdfOf(item.ativo)).length;
    const vehicleItems = items.filter((item) => Boolean(normalizePlate(item.ativo?.placa || item.placa)));
    // Não entregar documentação de um mesmo ativo a dois destinos no mesmo lote.
    const assetDestinations = new Map<string, string>();
    let conflictingDestinations = 0;
    for (const group of groups) for (const item of group.itens) {
      const assetKey = item.ativo?.id || normalizePlate(item.placa) || normalizePatrimonio(item.patrimonio);
      const destinationKey = `${normalize(group.cliente)}|${normalize(group.local)}`;
      if (assetKey && assetDestinations.has(assetKey) && assetDestinations.get(assetKey) !== destinationKey) {
        conflictingDestinations += 1;
      } else if (assetKey) assetDestinations.set(assetKey, destinationKey);
    }
    // Patrimônio contraditório não pode pegar PDF pela placa sem conferência.
    const mismatchedAssets = items.filter(item => item.ativo?.patrimonio && item.patrimonio &&
      normalizePatrimonio(item.ativo.patrimonio) !== normalizePatrimonio(item.patrimonio)).length;
    const vehicleFlowBlocked = vehicleItems.length > 0 && !isLocacaoFlow;
    const missingAvailability = isLocacaoFlow
      ? vehicleItems.filter((item) => {
          const plate = normalizePlate(item.ativo?.placa || item.placa);
          return disponibilidades[plate] !== 'sim';
        }).length
      : 0;

    return {
      totalGroups: groups.length,
      totalItems: items.length,
      missingContext,
      missingDocs,
      missingAvailability,
      mismatchedAssets,
      conflictingDestinations,
      vehicleFlowBlocked,
      ready: groups.length > 0 && items.length > 0 && missingContext === 0 && missingDocs === 0 &&
        mismatchedAssets === 0 && conflictingDestinations === 0 && missingAvailability === 0 && !vehicleFlowBlocked,
    };
  }, [groups, disponibilidades, isLocacaoFlow]);

  const getSubstitution = (group: ProtocolGroup) => {
    const sai = group.itens.find((item) => item.ativo?.id === group.substituicaoSaiId) || null;
    const entra = group.itens.find((item) => item.ativo?.id === group.substituicaoEntraId) || null;
    return { sai, entra };
  };

  const buildGroupObservationText = (group: ProtocolGroup) => {
    const { sai, entra } = getSubstitution(group);
    const parts = [`Grupo automático: ${group.cliente} / ${group.local}`];
    if (sai || entra) parts.push(`SUBSTITUIÇÃO: ${itemLabel(sai)} → ${itemLabel(entra)}`);
    if (group.observacao.trim()) parts.push(`OBSERVAÇÃO: ${group.observacao.trim()}`);
    return parts.join('\n');
  };

  const buildObservationItem = (item: ProtocolItem) => {
    const asset = item.ativo;
    const patrimonio = asset?.patrimonio || item.patrimonio || '—';
    const placa = normalizePlate(asset?.placa || item.placa) || '—';
    const descricao = asset?.descricao || item.descricao || '';
    const complemento = descricao ? ` — ${descricao}` : '';
    return `<li><strong>${escapeHtml(patrimonio)}</strong> — placa ${escapeHtml(placa)}${escapeHtml(complemento)}</li>`;
  };

  const buildProtocolHtml = (group: ProtocolGroup, primaryItem: ProtocolItem, copyNumber: 1 | 2, sequence: number, count: number) => {
    const asset = primaryItem?.ativo;
    const placa = normalizePlate(asset?.placa || primaryItem?.placa) || '—';
    const patrimonio = asset?.patrimonio || primaryItem?.patrimonio || '—';
    const dataFormatada = new Date(`${dataEmissao}T12:00:00`).toLocaleDateString('pt-BR');
    const exercicio = new Date(`${dataEmissao}T12:00:00`).getFullYear().toString();
    const destination = [group.cliente, group.local].filter(Boolean).join(' — ');
    const { sai, entra } = getSubstitution(group);
    const substitutionHtml = (sai || entra)
      ? `<div class="substitution-line"><strong>SUBSTITUIÇÃO DE EQUIPAMENTO:</strong><br/><span>SAI: ${escapeHtml(itemLabel(sai))}</span><span class="arrow">→</span><span>ENTRA: ${escapeHtml(itemLabel(entra))}</span></div>`
      : '';
    const customObservationHtml = group.observacao.trim()
      ? `<div class="custom-observation"><strong>OBSERVAÇÃO:</strong> ${escapeHtml(group.observacao.trim()).replace(/\n/g, '<br/>')}</div>`
      : '';

    return `
      <section class="protocol-page">
        <div class="page-number">Protocolo ${sequence} de ${count} — Via ${copyNumber} de 2</div>
        <header class="protocol-header">
          <div class="company-block">
            <strong>${escapeHtml(topac?.name || 'TOPAC MATRIZ')}</strong>
            <span>CNPJ: ${escapeHtml(topac?.cnpj || '')}</span>
          </div>
          <div class="protocol-title">PROTOCOLO DE LIBERAÇÃO DE DOCUMENTO</div>
        </header>

        <section class="protocol-box release-box">
          <div class="section-title">DADOS DA LIBERAÇÃO</div>
          <div class="detail-grid release-grid">
            <div class="field"><small>EMPRESA</small><strong>${escapeHtml(group.cliente || '—')}</strong></div>
            <div class="field"><small>LOCAL / CLIENTE</small><strong>${escapeHtml(group.local || '—')}</strong></div>
            <div class="field"><small>RESPONSÁVEL RECEBIMENTO</small><strong>${escapeHtml(group.responsavel || '—')}</strong></div>
            <div class="field"><small>DATA</small><strong>${escapeHtml(dataFormatada)}</strong></div>
          </div>
        </section>

        <section class="protocol-box asset-box">
          <div class="section-title">IDENTIFICAÇÃO DO ATIVO</div>
          <div class="detail-grid asset-grid">
            <div class="field"><small>PATRIMÔNIO</small><strong>${escapeHtml(patrimonio)}</strong></div>
            <div class="field"><small>PLACA</small><strong>${escapeHtml(placa)}</strong></div>
            <div class="field"><small>RENAVAM</small><strong>${escapeHtml(asset?.renavam || '—')}</strong></div>
            <div class="field field-wide"><small>CHASSI</small><strong>${escapeHtml(asset?.chassi || '—')}</strong></div>
            <div class="field"><small>ANO FABRICAÇÃO</small><strong>${escapeHtml(asset?.ano_fabricacao || '—')}</strong></div>
            <div class="field"><small>ANO MODELO</small><strong>${escapeHtml(asset?.ano_modelo || '—')}</strong></div>
            <div class="field"><small>EXERCÍCIO</small><strong>${escapeHtml(exercicio)}</strong></div>
          </div>
        </section>

        <section class="protocol-box observations-box">
          <div class="section-title">OBSERVAÇÕES</div>
          <div class="observations-content">
            ${substitutionHtml}
            ${customObservationHtml}
            <p>Documentos referentes exclusivamente ao equipamento identificado neste protocolo:</p>
            <ul>${buildObservationItem(primaryItem)}</ul>
            <p>A remessa será encaminhada para <strong>${escapeHtml(destination || group.cliente)}</strong>${group.responsavel ? `, aos cuidados de <strong>${escapeHtml(group.responsavel)}</strong>` : ''}.</p>
          </div>
        </section>

        <div class="signatures">
          <div><span></span><p>Assinatura — Entrega</p></div>
          <div><span></span><p>Assinatura — Recebimento</p></div>
        </div>
      </section>`;
  };

  const persistProtocols = async (operador: { id: string; nome: string }, { silent = false, documentsValidated = false }: { silent?: boolean; documentsValidated?: boolean } = {}) => {
    if (!readiness.ready) {
      toast.error('Não é possível salvar/imprimir enquanto houver Cliente, Local ou Documento pendente.');
      return null;
    }
    if (!session?.user?.id) {
      toast.error('Sessão expirada. Entre novamente.');
      return null;
    }

    setSaving(true);
    try {
      // Evita salvar protocolos que apontam para documentos removidos do Storage.
      // Na impressão, os PDFs já foram integralmente renderizados e validados.
      if (!documentsValidated) {
        const documents = new Map<string, string>();
        for (const item of groups.flatMap((group) => group.itens)) {
          const url = pdfOf(item.ativo);
          if (url) documents.set(url, normalizePlate(item.ativo?.placa || item.placa) || item.patrimonio || 'sem identificação');
        }
        for (const [url, vehicle] of documents) {
          try {
            const bytes = await fetchPdfBytes(url);
            if (new TextDecoder().decode(bytes.subarray(0, 1024)).indexOf('%PDF-') === -1) {
              throw new Error('O arquivo não é um PDF válido');
            }
          } catch {
            throw new Error(`Documento indisponível para ${vehicle}. Reenvie o PDF na Frota antes de salvar o protocolo.`);
          }
        }
      }

      const loteId = crypto.randomUUID();
      const payload = groups.flatMap((group) => group.itens.map((item) => {
        const asset = item.ativo!;
        const vehicleFields = toProtocolVehicleFields(asset);
        return {
          empresa_origem: topac?.name || 'TOPAC MATRIZ',
          empresa_destinataria: group.cliente,
          local_canteiro: group.local,
          responsavel_recebimento: group.responsavel || null,
          data_emissao: dataEmissao,
          ...vehicleFields,
          descricao_ativo: vehicleFields.descricao_ativo || item.descricao || null,
          placa: vehicleFields.placa || normalizePlate(item.placa) || null,
          patrimonio: vehicleFields.patrimonio || item.patrimonio || null,
          exercicio: new Date(`${dataEmissao}T12:00:00`).getFullYear().toString(),
          observacoes: `${buildGroupObservationText(group)}\nPROTOCOLO INDIVIDUAL: ${itemLabel(item)}`,
          texto_original: textoColado,
          criado_por: session.user.id,
          operador_id: operador.id,
          operador_nome: operador.nome,
          protocolo_lote_id: loteId,
        };
      }));

      const { data, error } = await supabase
        .from('protocolos_documentos' as any)
        .insert(payload as any)
        .select('id');
      if (error) throw error;

      const ids = ((data as any[]) || []).map((row) => String(row.id));
      setLastSavedIds(ids);

      await registrarAcao({
        modulo: 'protocolo',
        entidade: 'protocolos_documentos',
        entidadeId: ids[0] || undefined,
        acao: 'gerou',
        depois: {
          grupos: groups.map((group) => ({
            cliente: group.cliente,
            local: group.local,
            responsavel: group.responsavel,
            observacao: group.observacao,
            substituicaoSaiId: group.substituicaoSaiId || null,
            substituicaoEntraId: group.substituicaoEntraId || null,
            ativos: group.itens.map((item) => item.ativo?.id),
          })),
          ids,
        },
        observacao: `${payload.length} protocolo(s) individual(is) em ${groups.length} destino(s), regra Cliente + Local.`,
      });

      if (!silent) toast.success(`${payload.length} protocolo(s) individual(is) salvo(s) no Supabase.`);
      return ids;
    } catch (error: any) {
      toast.error(`Não foi possível salvar os protocolos: ${error?.message || error}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const printProtocol = async (codigo: string, operador: { id: string; nome: string }) => {
    if (!readiness.ready) {
      toast.error('IMPRESSÃO BLOQUEADA: existe Cliente/Local pendente ou Documento Faltando.');
      return;
    }

    setPrinting(true);
    try {
      // Pré-renderiza os documentos ANTES de persistir, enviar e-mails ou alterar a
      // disponibilidade. Um PDF 404 jamais pode formalizar uma locação incompleta.
      const validatedPages = new Map<string, string[]>();
      for (const item of groups.flatMap((group) => group.itens)) {
        const url = pdfOf(item.ativo);
        if (!url || validatedPages.has(url)) continue;
        const vehicle = normalizePlate(item.ativo?.placa || item.placa) || item.patrimonio || 'não identificado';
        try {
          const { pageUrls } = await renderPdfPagesToDataUrls(url, 1.55);
          if (!pageUrls.length) throw new Error('PDF sem páginas');
          validatedPages.set(url, pageUrls);
        } catch {
          throw new Error(`PDF da Frota indisponível para ${vehicle}. Atualize o documento no cadastro da Frota e confira o vínculo antes de imprimir.`);
        }
      }

      const saved = await persistProtocols(operador, { silent: true, documentsValidated: true });
      if (!saved) return;

      try {
        await formalizarOperacaoPorEmail({ type: 'locacao', ids: saved });
      } catch (mailError: any) {
        toast.warning(mailError?.message || 'Locação registrada; formalização por e-mail ficou pendente.');
      }

      if (isLocacaoFlow) {
        const plates = Array.from(new Set(groups.flatMap((group) => group.itens)
          .map((item) => normalizePlate(item.ativo?.placa || item.placa))
          .filter(Boolean)));
        for (const plate of plates) {
          const { data, error } = await rpc.rpc('operacional_definir_disponibilidade', {
            p_codigo_operador: codigo,
            p_placa: plate,
            p_status: 'nao',
            p_motivo: `Locação formalizada e documento liberado junto ao protocolo ${saved.join(', ')}.`,
          });
          if (error || !data?.ok) {
            toast.warning(`Protocolo salvo, mas não foi possível atualizar a disponibilidade da placa ${plate}.`);
          }
        }
        setDisponibilidades((current) => {
          const next = { ...current };
          plates.forEach((plate) => { next[plate] = 'nao'; });
          return next;
        });
      }

      let content = '';
      const printJobs = createProtocolPrintJobs(groups);
      for (const job of printJobs) {
        // Cada via identifica apenas o seu próprio patrimônio, placa e dados.
        for (const via of job.copies) {
          content += buildProtocolHtml(job.group, job.item, via, job.sequence, job.count);
        }

        // Anexar o PDF certo logo depois das vias daquele equipamento.
        const url = pdfOf(job.item.ativo);
        const documentName = job.item.ativo?.documento_nome || itemLabel(job.item);
        const pageUrls = validatedPages.get(url) || [];
        if (!pageUrls.length) {
          throw new Error(`O documento de ${itemLabel(job.item)} não possui páginas renderizáveis.`);
        }
        content += pageUrls.map((pageUrl, pageIndex) => `
          <section class="document-page" data-document="${escapeHtml(documentName)}" data-page="${pageIndex + 1}">
            <img src="${pageUrl}" alt="${escapeHtml(documentName)} — página ${pageIndex + 1}" loading="eager" decoding="sync" />
          </section>`).join('');
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Protocolos TOPAC</title><style>
        @page{size:A4;margin:0}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .protocol-page{position:relative;width:210mm;height:297mm;padding:13mm 14mm 12mm;background:#fff;page-break-after:always;overflow:hidden}
        .page-number{position:absolute;right:14mm;top:7mm;font-size:8.5px;color:#555}
        .protocol-header{display:grid;grid-template-columns:1fr 1.15fr;align-items:start;gap:12mm;padding-top:3mm;padding-bottom:5mm;border-bottom:1.4px solid #222}
        .company-block{display:flex;flex-direction:column;gap:2px;font-size:9px;line-height:1.25}
        .company-block strong{font-size:13px;letter-spacing:.15px}
        .protocol-title{text-align:right;font-size:12.5px;line-height:1.2;font-weight:800;text-transform:uppercase}
        .protocol-box{margin-top:6mm;border:1px solid #aaa;background:#fff}
        .section-title{padding:2.2mm 3mm;border-bottom:1px solid #aaa;background:#f1f1f1;font-size:9px;font-weight:800;letter-spacing:.35px;text-transform:uppercase}
        .detail-grid{display:grid;background:#fff}
        .release-grid{grid-template-columns:1fr 1fr}
        .asset-grid{grid-template-columns:1fr 1fr 1fr}
        .field{min-height:16mm;padding:3mm;border-right:1px solid #c7c7c7;border-bottom:1px solid #c7c7c7;display:flex;flex-direction:column;gap:1.5mm}
        .release-grid .field:nth-child(2n),.asset-grid .field:nth-child(3n){border-right:0}
        .release-grid .field:nth-last-child(-n+2),.asset-grid .field:nth-last-child(-n+3){border-bottom:0}
        .field-wide{grid-column:span 3;border-right:0!important}
        .field small{font-size:7.5px;font-weight:700;color:#555;letter-spacing:.2px}
        .field strong{font-size:10.5px;line-height:1.25;font-weight:600;word-break:break-word}
        .observations-box{min-height:63mm}
        .observations-content{padding:4mm 5mm;font-size:9.2px;line-height:1.45}
        .observations-content p{margin:0 0 3mm}
        .observations-content ul{margin:0 0 4mm 4.5mm;padding-left:4mm}
        .observations-content li{margin:1.1mm 0}
        .substitution-line{margin:0 0 4mm;padding:3mm;border:1.5px solid #222;background:#f4f4f4;font-size:9px;line-height:1.5}
        .substitution-line span{display:inline-block;margin-top:1.5mm}
        .substitution-line .arrow{padding:0 3mm;font-size:13px;font-weight:800}
        .custom-observation{margin:0 0 4mm;padding:3mm;border-left:3px solid #333;background:#fafafa;font-size:9px;line-height:1.45}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:22mm;text-align:center;font-size:9px}
        .signatures>div span{display:block;border-top:1px solid #444;width:100%;height:2mm}
        .signatures p{margin:0}
        .document-page{width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff;page-break-after:always;break-after:page}
        .document-page img{display:block;width:100%;height:100%;max-width:210mm;max-height:297mm;object-fit:contain;background:#fff}
        @media print{
          .protocol-page,.document-page{page-break-after:always;break-after:page}
          .protocol-page:last-child,.document-page:last-child{page-break-after:auto}
        }
      </style></head><body>${content}</body></html>`;

      printDocumentInPage(html);
      toast.success(`Impressão aberta: ${createProtocolPrintJobs(groups).length} protocolo(s) individual(is), 2 vias e documento específico de cada equipamento.`);
    } catch (error: any) {
      toast.error(`Não foi possível montar a impressão: ${error?.message || error}`);
    } finally {
      setPrinting(false);
    }
  };

  const pedirCodigo = (action: 'save' | 'print') => {
    if (developerMode) {
      void confirmarCodigoOperador('', action);
      return;
    }
    setCodigoAction(action);
    setCodigoOpen(true);
  };

  const confirmarCodigoOperador = async (codigo: string, forcedAction?: 'save' | 'print') => {
    const action = forcedAction || codigoAction;
    if (!action) return;
    setCodigoLoading(true);
    try {
      const { data, error } = await rpc.rpc('operador_operacao_validar_codigo', {
        p_codigo: codigo,
        p_modulo: 'operacional',
      });
      if (error || !data?.ok || !data?.operador?.id) {
        toast.error(data?.error || error?.message || 'Código de operador inválido.');
        return;
      }

      const operador = {
        id: String(data.operador.id),
        nome: String(data.operador.nome || 'Operador'),
      };

      if (action === 'save') {
        await persistProtocols(operador);
      } else {
        await printProtocol(codigo, operador);
      }

      setCodigoOpen(false);
      setCodigoAction(null);
    } finally {
      setCodigoLoading(false);
    }
  };

  const clearAll = () => {
    setTextoColado('');
    setGroups([]);
    setLastSavedIds([]);
    setDataEmissao(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium gradient-primary p-6 text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/20">
            <FileCheck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Protocolos Inteligentes</h1>
            <p className="text-sm text-primary-foreground/70">Uma mensagem gera protocolos individuais por ativo, separados por cliente e local</p>
          </div>
        </div>
      </div>

      <section className="card-premium space-y-4 border-2 border-primary/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <label htmlFor="protocol-smart-message" className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" /> Processar Mensagem Inteligente (IA)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">Cole uma única mensagem, mesmo com vários clientes e equipamentos. O sistema identifica o destino de cada ativo e prepara duas vias próprias por equipamento.</p>
          </div>
          <div className="flex gap-2">
            <Input type="date" value={dataEmissao} onChange={(event) => setDataEmissao(event.target.value)} className="w-40" />
            <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
          </div>
        </div>

        <textarea
          id="protocol-smart-message"
          aria-label="Processar Mensagem Inteligente (IA)"
          value={textoColado}
          onChange={(event) => setTextoColado(event.target.value)}
          placeholder="Ex.: Compressores patrimônios C01.123, C01.124 e C01.125 — Cliente Construtech — Local Campinas..."
          className="min-h-44 w-full resize-y rounded-xl border-2 border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => void processSmartMessage()} disabled={parsing || loadingAssets} className="min-w-[280px]">
            {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {parsing ? 'Processando mensagem...' : 'Identificar e preparar todos os protocolos'}
          </Button>
          <Button variant="outline" onClick={() => void relink()} disabled={!groups.length || loadingAssets}>
            <LinkIcon className="mr-2 h-4 w-4" /> Conferir documentos novamente
          </Button>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="card-premium space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Protocolos individuais identificados</h2>
              <p className="text-xs text-muted-foreground">{readiness.totalGroups} destino(s) • {readiness.totalItems} protocolo(s) individuais • 2 vias por equipamento</p>
            </div>
            <Badge className={readiness.ready ? '' : 'border-destructive/40 bg-destructive/10 text-destructive'} variant="outline">
              {readiness.ready ? 'Pronto para imprimir' : `${readiness.missingDocs + readiness.missingContext + readiness.mismatchedAssets + readiness.conflictingDestinations} pendência(s) de dados`}
            </Badge>
          </div>

          {groups.map((group, groupIndex) => {
            const substitution = getSubstitution(group);
            return (
              <section key={group.key} className="space-y-4 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destino {groupIndex + 1}</p>
                    <h3 className="text-base font-bold">{group.cliente || 'Cliente não identificado'} / {group.local || 'Local não identificado'}</h3>
                  </div>
                  <Badge variant="outline">{group.itens.length} protocolo(s) individual(is)</Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div><label className="mb-1 block text-xs text-muted-foreground">Cliente</label><Input value={group.cliente} onChange={(event) => updateGroup(group.key, 'cliente', event.target.value)} placeholder="Cliente" /></div>
                  <div><label className="mb-1 block text-xs text-muted-foreground">Local / Canteiro</label><Input value={group.local} onChange={(event) => updateGroup(group.key, 'local', event.target.value)} placeholder="Local" /></div>
                  <div><label className="mb-1 block text-xs text-muted-foreground">Responsável</label><Input value={group.responsavel} onChange={(event) => updateGroup(group.key, 'responsavel', event.target.value)} placeholder="Responsável pelo recebimento" /></div>
                </div>

                <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.045] p-4 shadow-[0_0_24px_rgba(245,158,11,.05)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-5 w-5 text-amber-400" />
                      <div>
                        <p className="text-sm font-extrabold text-foreground">Movimentação / Substituição de Equipamento</p>
                        <p className="text-[11px] text-muted-foreground">Selecione quem sai e quem entra. Se a mensagem disser “substituição”, o sistema tenta sugerir automaticamente.</p>
                      </div>
                    </div>
                    {(substitution.sai || substitution.entra) && (
                      <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-300">SUBSTITUIÇÃO REGISTRADA</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_auto_1fr]">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-red-300">Equipamento que SAI</label>
                      <select
                        value={group.substituicaoSaiId}
                        onChange={(event) => updateGroup(group.key, 'substituicaoSaiId', event.target.value)}
                        className="h-11 w-full rounded-lg border border-red-400/25 bg-background px-3 text-sm text-foreground outline-none focus:border-red-400/60"
                      >
                        <option value="">Nenhum / não se aplica</option>
                        {group.itens.map((item, index) => (
                          <option key={`sai-${group.key}-${index}`} value={item.ativo?.id || ''} disabled={!item.ativo?.id}>{itemLabel(item)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="hidden pb-2 lg:block"><ArrowRightLeft className="h-6 w-6 text-amber-400" /></div>

                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-emerald-300">Equipamento que ENTRA</label>
                      <select
                        value={group.substituicaoEntraId}
                        onChange={(event) => updateGroup(group.key, 'substituicaoEntraId', event.target.value)}
                        className="h-11 w-full rounded-lg border border-emerald-400/25 bg-background px-3 text-sm text-foreground outline-none focus:border-emerald-400/60"
                      >
                        <option value="">Nenhum / não se aplica</option>
                        {group.itens.map((item, index) => (
                          <option key={`entra-${group.key}-${index}`} value={item.ativo?.id || ''} disabled={!item.ativo?.id}>{itemLabel(item)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(substitution.sai || substitution.entra) && (
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-amber-400/20 bg-black/20 px-3 py-3 text-xs">
                      <div><span className="block text-[10px] font-bold text-red-300">SAI</span><strong className="text-foreground">{itemLabel(substitution.sai)}</strong></div>
                      <ArrowRightLeft className="h-5 w-5 text-amber-400" />
                      <div><span className="block text-[10px] font-bold text-emerald-300">ENTRA</span><strong className="text-foreground">{itemLabel(substitution.entra)}</strong></div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.035] p-4">
                  <label className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                    <MessageSquareText className="h-4 w-4 text-violet-300" /> Observação do Protocolo
                  </label>
                  <textarea
                    value={group.observacao}
                    onChange={(event) => updateGroup(group.key, 'observacao', event.target.value)}
                    placeholder="Escreva aqui qualquer orientação que precise aparecer no protocolo. Ex.: equipamento enviado em substituição temporária, motivo da troca, condição de entrega, informação ao cliente..."
                    className="min-h-24 w-full resize-y rounded-lg border border-violet-400/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/10"
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">Esta observação fica salva no registro e sai impressa na área de OBSERVAÇÕES do protocolo.</p>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/50">
                      <tr><th className="px-3 py-2 text-left">Protocolo por ativo / equipamento</th><th className="px-3 py-2 text-left">Patrimônio</th><th className="px-3 py-2 text-left">Placa</th><th className="px-3 py-2 text-left">Documento</th></tr>
                    </thead>
                    <tbody>
                      {group.itens.map((item, itemIndex) => {
                        const url = pdfOf(item.ativo);
                        return (
                          <tr key={`${group.key}-${itemIndex}`} className="border-t">
                            <td className="px-3 py-3"><strong>{item.ativo?.descricao || item.descricao || 'Ativo não localizado'}</strong><div className="text-xs text-muted-foreground">Individual · 2 vias + documento próprio</div></td>
                            <td className="px-3 py-3">{item.ativo?.patrimonio || item.patrimonio || '—'}</td>
                            <td className="px-3 py-3">{normalizePlate(item.ativo?.placa || item.placa) || '—'}</td>
                            <td className="px-3 py-3">
                              {item.ativo && url ? (
                                <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                                  <CheckCircle2 className="h-4 w-4" /> Documento conferido — liberado somente junto à impressão do protocolo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                                  <AlertTriangle className="h-4 w-4" /> Documento Faltando
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Documento protegido. A consulta livre fica bloqueada; o arquivo é liberado somente dentro da impressão do protocolo de locação.
                </div>
              </section>
            );
          })}
        </section>
      )}

      {groups.length > 0 && (
        <section className="card-premium space-y-4 p-5">
          {readiness.missingDocs > 0 && (
            <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">IMPRESSÃO BLOQUEADA — DOCUMENTO FALTANDO</p>
                  <p className="mt-1">Existem {readiness.missingDocs} ativo(s) sem PDF vinculado no Supabase. Cadastre o documento na Frota e clique em “Conferir documentos novamente”.</p>
                </div>
              </div>
            </div>
          )}

          {(readiness.mismatchedAssets > 0 || readiness.conflictingDestinations > 0) && (
            <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-bold">IMPRESSÃO BLOQUEADA — DADOS DE EQUIPAMENTO OU DESTINO CONFLITANTES</p>
              <p className="mt-1">{readiness.mismatchedAssets} patrimônio(s) divergente(s) da Frota e {readiness.conflictingDestinations} ativo(s) enviados a destinos distintos no mesmo pedido. Confira a mensagem e o cadastro antes de liberar.</p>
            </div>
          )}

          {readiness.missingContext > 0 && (
            <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">IMPRESSÃO BLOQUEADA — CLIENTE/LOCAL PENDENTE</p>
                  <p className="mt-1">Preencha Cliente e Local/Canteiro em todos os grupos antes de imprimir.</p>
                </div>
              </div>
            </div>
          )}

          {isLocacaoFlow && readiness.missingAvailability > 0 && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-500/10 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">LOCAÇÃO BLOQUEADA — DISPONIBILIDADE NÃO CONFIRMADA</p>
                  <p className="mt-1">Há {readiness.missingAvailability} placa(s) com estado NÃO ou PENDENTE. A impressão só é liberada quando a disponibilidade estiver SIM.</p>
                </div>
              </div>
            </div>
          )}

          {readiness.vehicleFlowBlocked && (
            <div className="rounded-xl border-2 border-red-400 bg-red-500/10 p-4 text-sm text-red-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">DOCUMENTO DE VEÍCULO BLOQUEADO</p>
                  <p className="mt-1">Para veículo com placa, inicie pela área DISPONIBILIDADE DE PLACAS. O documento só é liberado no fechamento da locação, junto com o protocolo.</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="lg" disabled={saving || !readiness.ready} onClick={() => pedirCodigo('save')}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
              {saving ? 'Salvando...' : `Salvar ${readiness.totalItems} protocolos`}
            </Button>
            <Button size="lg" disabled={printing || saving || !readiness.ready} onClick={() => pedirCodigo('print')} className="gradient-accent text-accent-foreground">
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              {printing ? 'Montando impressão...' : `Imprimir todos (${readiness.totalItems})`}
            </Button>
            {lastSavedIds.length > 0 && <span className="self-center text-xs text-success">Arquivado no Supabase: {lastSavedIds.length} registro(s)</span>}
          </div>

          <p className="text-xs text-muted-foreground">Uma única mensagem e uma única impressão do lote: cada equipamento sai em protocolo exclusivo, com 2 vias de seu protocolo e o respectivo PDF da Frota em seguida. Destinos diferentes nunca dividem o mesmo protocolo.</p>
        </section>
      )}

      <OperadorCodeDialog
        open={codigoOpen}
        onOpenChange={(open) => {
          if (!codigoLoading) {
            setCodigoOpen(open);
            if (!open) setCodigoAction(null);
          }
        }}
        loading={codigoLoading}
        title={codigoAction === 'print' ? 'Liberar impressão do protocolo' : 'Confirmar salvamento do protocolo'}
        description="Informe seu código individual. Operador, data, hora e ação ficarão registrados no histórico."
        onConfirm={confirmarCodigoOperador}
      />
    </div>
  );
};

export default ProtocoloPage;
