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

  const buildRows = (group: ProtocolGroup) => group.itens.map((item, index) => {
    const asset = item.ativo;
    return `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(asset?.descricao || item.descricao || 'Equipamento / veículo')}</td>
      <td>${escapeHtml(asset?.patrimonio || item.patrimonio || '—')}</td>
      <td>${escapeHtml(normalizePlate(asset?.placa || item.placa) || '—')}</td>
      <td>${escapeHtml(asset?.renavam || '—')}</td>
      <td>${escapeHtml(asset?.chassi || '—')}</td>
    </tr>`;
  }).join('');

  // As duas vias usam exatamente o mesmo HTML para permanecerem idênticas.
  const buildProtocolHtml = (group: ProtocolGroup) => `
    <section class="protocol-page">
      <header class="protocol-header">
        <div>
          <strong>${escapeHtml(topac?.name || 'TOPAC MATRIZ')}</strong>
          <span>CNPJ: ${escapeHtml(topac?.cnpj || '')}</span>
        </div>
        <div class="protocol-title">PROTOCOLO DE LIBERAÇÃO DE DOCUMENTOS</div>
      </header>
      <div class="context-grid">
        <div><small>CLIENTE</small><strong>${escapeHtml(group.cliente)}</strong></div>
        <div><small>LOCAL / CANTEIRO</small><strong>${escapeHtml(group.local)}</strong></div>
        <div><small>RESPONSÁVEL</small><strong>${escapeHtml(group.responsavel || '—')}</strong></div>
        <div><small>DATA</small><strong>${escapeHtml(new Date(`${dataEmissao}T12:00:00`).toLocaleDateString('pt-BR'))}</strong></div>
      </div>
      <h2>DOCUMENTOS ENTREGUES</h2>
      <table>
        <thead><tr><th>#</th><th>Ativo / Equipamento</th><th>Patrimônio</th><th>Placa</th><th>RENAVAM</th><th>Chassi</th></tr></thead>
        <tbody>${buildRows(group)}</tbody>
      </table>
      <p class="protocol-note">Todos os itens deste protocolo pertencem ao mesmo Cliente + Local.</p>
      <div class="signatures">
        <div><hr/>Assinatura — Entrega</div>
        <div><hr/>Assinatura — Recebimento</div>
      </div>
    </section>`;

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
        const protocolHtml = buildProtocolHtml(group);
        content += protocolHtml; // 1ª via
        content += protocolHtml; // 2ª via idêntica

        const uniqueDocs = new Map<string, string>();
        group.itens.forEach((item) => {
          const url = pdfOf(item.ativo);
          if (url && !uniqueDocs.has(url)) {
            uniqueDocs.set(url, item.ativo?.documento_nome || item.ativo?.descricao || 'Documento');
          }
        });

        for (const [url] of uniqueDocs) {
          const { pageUrls } = await renderPdfPagesToDataUrls(url, 1.45);
          content += pageUrls.map((pageUrl) => `
            <section class="document-page">
              <img src="${pageUrl}" alt="Documento vinculado" />
            </section>`).join('');
        }
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Protocolos TOPAC</title><style>
        @page{size:A4;margin:0}
        *{box-sizing:border-box}
        body{margin:0;font-family:Arial,sans-serif;color:#111;background:#fff}
        .protocol-page{width:210mm;min-height:297mm;padding:14mm;page-break-after:always}
        .protocol-header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:10px}
        .protocol-header>div:first-child{display:flex;flex-direction:column;gap:4px;font-size:11px}
        .protocol-header>div:first-child strong{font-size:16px}
        .protocol-title{text-align:right;font-weight:800;font-size:15px;max-width:90mm}
        .context-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
        .context-grid>div{border:1px solid #bbb;padding:9px;min-height:48px}
        .context-grid small{display:block;font-size:8px;font-weight:700;color:#666;margin-bottom:4px}
        .context-grid strong{font-size:12px}
        h2{font-size:12px;margin:18px 0 8px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #aaa;padding:6px;font-size:9px;text-align:left;vertical-align:top}
        th{background:#f1f1f1;text-transform:uppercase}
        .protocol-note{font-size:9px;color:#555;margin-top:10px}
        .signatures{display:flex;justify-content:space-between;gap:30px;margin-top:58px;text-align:center;font-size:10px}
        .signatures>div{width:45%}
        .document-page{width:210mm;min-height:297mm;display:flex;align-items:flex-start;justify-content:center;page-break-after:always;background:#fff}
        .document-page img{width:210mm;max-height:297mm;object-fit:contain;display:block}
      </style></head><body>${content}</body></html>`;

      // printDocumentInPage usa Window.print() no contexto do iframe do navegador.
      printDocumentInPage(html);
      toast.success('Impressão aberta: 2 vias idênticas do protocolo + 1 via de cada documento vinculado.');
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

          <p className="text-xs text-muted-foreground">Impressão unificada: 2 vias idênticas do protocolo no início + 1 via completa de cada documento vinculado em sequência. A janela de impressão é aberta pelo navegador.</p>
        </section>
      )}
    </div>
  );
};

export default ProtocoloPage;
