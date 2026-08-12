import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck, LinkIcon, Loader2, Printer, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcao } from '@/lib/acoesLog';
import { toast } from 'sonner';

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
  itens: ProtocolItem[];
}

const PROTOCOL_PARSE_ENDPOINT = '/api/protocolos-parse'; // Vercel Function: /api/protocolos-parse.ts

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

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const pdfOf = (asset: AtivoDoc | null) => String(asset?.documento_url || asset?.arquivo_url || '').trim();

// Mantidos como contrato do módulo Frota/Protocolo.
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

const ProtocoloPage: React.FC = () => {
  const { companies, session } = useApp();
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
  }, []);

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
      // Atualiza a Frota antes de cruzar placa/patrimônio, evitando resultado com cache antigo.
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

      const nextGroups: ProtocolGroup[] = (payload.groups || []).map((group: any, index: number) => ({
        key: `${Date.now()}-${index}`,
        cliente: String(group.cliente || '').trim(),
        local: String(group.local || '').trim(),
        responsavel: String(group.responsavel || '').trim(),
        itens: (group.itens || []).map((item: ParsedItem) => ({
          placa: normalizePlate(item.placa),
          patrimonio: String(item.patrimonio || '').trim(),
          descricao: String(item.descricao || '').trim(),
          ativo: resolveAsset(item, freshAssets),
        })),
      }));

      if (!nextGroups.length) throw new Error('Nenhum grupo Cliente + Local foi identificado.');

      setGroups(nextGroups);
      setLastSavedIds([]);

      const missing = nextGroups
        .flatMap((group) => group.itens)
        .filter((item) => !item.ativo || !pdfOf(item.ativo)).length;

      if (missing > 0) {
        toast.error(`${missing} ativo(s) estão com Documento Faltando. A impressão foi bloqueada.`);
      } else {
        toast.success(`${nextGroups.length} grupo(s) processado(s) por Cliente + Local com todos os documentos vinculados.`);
      }
    } catch (error: any) {
      setGroups([]);
      toast.error(error?.message || 'Não foi possível processar a mensagem.');
    } finally {
      setParsing(false);
    }
  };

  const updateGroup = (key: string, field: 'cliente' | 'local' | 'responsavel', value: string) => {
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

    return {
      totalGroups: groups.length,
      totalItems: items.length,
      missingContext,
      missingDocs,
      ready: groups.length > 0 && items.length > 0 && missingContext === 0 && missingDocs === 0,
    };
  }, [groups]);

  const buildObservationItems = (group: ProtocolGroup) => group.itens.map((item) => {
    const asset = item.ativo;
    const patrimonio = asset?.patrimonio || item.patrimonio || '—';
    const placa = normalizePlate(asset?.placa || item.placa) || '—';
    const descricao = asset?.descricao || item.descricao || '';
    const complemento = descricao ? ` — ${descricao}` : '';
    return `<li><strong>${escapeHtml(patrimonio)}</strong> — placa ${escapeHtml(placa)}${escapeHtml(complemento)}</li>`;
  }).join('');

  // Modelo oficial de impressão: folha detalhada, no padrão físico aprovado pelo usuário.
  // A identificação principal utiliza o primeiro ativo do grupo e os demais permanecem listados em Observações.
  const buildProtocolHtml = (group: ProtocolGroup, copyNumber: 1 | 2) => {
    const primaryItem = group.itens[0];
    const asset = primaryItem?.ativo;
    const placa = normalizePlate(asset?.placa || primaryItem?.placa) || '—';
    const patrimonio = asset?.patrimonio || primaryItem?.patrimonio || '—';
    const dataFormatada = new Date(`${dataEmissao}T12:00:00`).toLocaleDateString('pt-BR');
    const exercicio = new Date(`${dataEmissao}T12:00:00`).getFullYear().toString();
    const destination = [group.cliente, group.local].filter(Boolean).join(' — ');

    return `
      <section class="protocol-page">
        <div class="page-number">Página ${copyNumber} de 2</div>
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
            <p>Por favor, acondicionar os protocolos de documentos referentes aos equipamentos/veículos e patrimônios:</p>
            <ul>${buildObservationItems(group)}</ul>
            <p>A remessa será encaminhada para <strong>${escapeHtml(destination || group.cliente)}</strong>${group.responsavel ? `, aos cuidados de <strong>${escapeHtml(group.responsavel)}</strong>` : ''}.</p>
          </div>
        </section>

        <div class="signatures">
          <div><span></span><p>Assinatura — Entrega</p></div>
          <div><span></span><p>Assinatura — Recebimento</p></div>
        </div>
      </section>`;
  };

  const persistProtocols = async ({ silent = false }: { silent?: boolean } = {}) => {
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
          observacoes: `Grupo automático: ${group.cliente} / ${group.local}`,
          texto_original: textoColado,
          criado_por: session.user.id,
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
            ativos: group.itens.map((item) => item.ativo?.id),
          })),
          ids,
        },
        observacao: `${groups.length} protocolo(s), regra Cliente + Local, ${payload.length} documento(s).`,
      });

      if (!silent) toast.success(`${groups.length} protocolo(s) salvo(s) no Supabase.`);
      return ids;
    } catch (error: any) {
      toast.error(`Falha ao salvar os protocolos no Supabase: ${error?.message || error}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const printProtocol = async () => {
    if (!readiness.ready) {
      toast.error('IMPRESSÃO BLOQUEADA: existe Cliente/Local pendente ou Documento Faltando.');
      return;
    }

    setPrinting(true);
    try {
      const saved = await persistProtocols({ silent: true });
      if (!saved) return;

      let content = '';
      for (const group of groups) {
        content += buildProtocolHtml(group, 1);
        content += buildProtocolHtml(group, 2);

        const uniqueDocs = new Map<string, string>();
        group.itens.forEach((item) => {
          const url = pdfOf(item.ativo);
          if (url && !uniqueDocs.has(url)) {
            uniqueDocs.set(url, item.ativo?.documento_nome || item.ativo?.descricao || 'Documento');
          }
        });

        for (const [url, documentName] of uniqueDocs) {
          const { pageUrls } = await renderPdfPagesToDataUrls(url, 1.55);
          if (!pageUrls.length) {
            throw new Error(`O documento ${documentName} não possui páginas renderizáveis.`);
          }
          content += pageUrls.map((pageUrl, pageIndex) => `
            <section class="document-page" data-document="${escapeHtml(documentName)}" data-page="${pageIndex + 1}">
              <img src="${pageUrl}" alt="${escapeHtml(documentName)} — página ${pageIndex + 1}" loading="eager" decoding="sync" />
            </section>`).join('');
        }
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

      // printDocumentInPage aguarda carregamento + decode das imagens antes de chamar Window.print().
      printDocumentInPage(html);
      toast.success('Impressão aberta: 2 vias no modelo detalhado + 1 via completa de cada documento vinculado.');
    } catch (error: any) {
      toast.error(`Não foi possível montar a impressão: ${error?.message || error}`);
    } finally {
      setPrinting(false);
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
            <p className="text-sm text-primary-foreground/70">IA para agrupar ativos por Cliente + Local e validar os documentos da Frota</p>
          </div>
        </div>
      </div>

      <section className="card-premium space-y-4 border-2 border-primary/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <label htmlFor="protocol-smart-message" className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" /> Processar Mensagem Inteligente (IA)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">Cole a mensagem completa. A IA separa automaticamente os ativos por Cliente + Local e cruza placa/patrimônio com o Supabase.</p>
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
            {parsing ? 'Processando mensagem...' : 'Processar Mensagem e Agrupar Ativos'}
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
              <h2 className="text-lg font-bold">Resultado do Agrupamento Inteligente</h2>
              <p className="text-xs text-muted-foreground">{readiness.totalGroups} grupo(s) • {readiness.totalItems} ativo(s) • regra obrigatória: Cliente + Local</p>
            </div>
            <Badge className={readiness.ready ? '' : 'border-destructive/40 bg-destructive/10 text-destructive'} variant="outline">
              {readiness.ready ? 'Pronto para imprimir' : `${readiness.missingDocs + readiness.missingContext} pendência(s)`}
            </Badge>
          </div>

          {groups.map((group, groupIndex) => (
            <section key={group.key} className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protocolo {groupIndex + 1}</p>
                  <h3 className="text-base font-bold">{group.cliente || 'Cliente não identificado'} / {group.local || 'Local não identificado'}</h3>
                </div>
                <Badge variant="outline">{group.itens.length} ativo(s)</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><label className="mb-1 block text-xs text-muted-foreground">Cliente</label><Input value={group.cliente} onChange={(event) => updateGroup(group.key, 'cliente', event.target.value)} placeholder="Cliente" /></div>
                <div><label className="mb-1 block text-xs text-muted-foreground">Local / Canteiro</label><Input value={group.local} onChange={(event) => updateGroup(group.key, 'local', event.target.value)} placeholder="Local" /></div>
                <div><label className="mb-1 block text-xs text-muted-foreground">Responsável</label><Input value={group.responsavel} onChange={(event) => updateGroup(group.key, 'responsavel', event.target.value)} placeholder="Responsável pelo recebimento" /></div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/50">
                    <tr><th className="px-3 py-2 text-left">Ativo / Equipamento</th><th className="px-3 py-2 text-left">Patrimônio</th><th className="px-3 py-2 text-left">Placa</th><th className="px-3 py-2 text-left">Documento</th></tr>
                  </thead>
                  <tbody>
                    {group.itens.map((item, itemIndex) => {
                      const url = pdfOf(item.ativo);
                      return (
                        <tr key={`${group.key}-${itemIndex}`} className="border-t">
                          <td className="px-3 py-3"><strong>{item.ativo?.descricao || item.descricao || 'Ativo não localizado'}</strong></td>
                          <td className="px-3 py-3">{item.ativo?.patrimonio || item.patrimonio || '—'}</td>
                          <td className="px-3 py-3">{normalizePlate(item.ativo?.placa || item.placa) || '—'}</td>
                          <td className="px-3 py-3">
                            {item.ativo && url ? (
                              <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                                <CheckCircle2 className="h-4 w-4" /> PDF vinculado automaticamente — Documento OK
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

              {group.itens.map((item, itemIndex) => {
                const url = pdfOf(item.ativo);
                return url ? (
                  <details key={`pdf-${group.key}-${itemIndex}`} className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-xs font-semibold">Visualizar {item.ativo?.documento_nome || item.ativo?.descricao || 'documento vinculado'}</summary>
                    <div className="mt-3"><PdfDocumentViewer source={{ url, tipo: 'protocolo' }} title={item.ativo?.descricao || 'Documento da Frota'} /></div>
                  </details>
                ) : null;
              })}
            </section>
          ))}
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

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="lg" disabled={saving || !readiness.ready} onClick={() => void persistProtocols()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar Protocolos'}
            </Button>
            <Button size="lg" disabled={printing || saving || !readiness.ready} onClick={() => void printProtocol()} className="gradient-accent text-accent-foreground">
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              {printing ? 'Montando impressão...' : 'Imprimir Protocolo'}
            </Button>
            {lastSavedIds.length > 0 && <span className="self-center text-xs text-success">Arquivado no Supabase: {lastSavedIds.length} registro(s)</span>}
          </div>

          <p className="text-xs text-muted-foreground">Impressão unificada: 2 vias no modelo detalhado do protocolo + 1 via completa de cada documento vinculado em sequência. A janela de impressão é aberta pelo navegador.</p>
        </section>
      )}
    </div>
  );
};

export default ProtocoloPage;
