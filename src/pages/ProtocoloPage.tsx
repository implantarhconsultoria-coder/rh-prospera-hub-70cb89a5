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

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const pdfOf = (asset: AtivoDoc | null) => String(asset?.documento_url || asset?.arquivo_url || '').trim();

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

  const loadAssets = async () => {
    setLoadingAssets(true);
    const { data, error } = await supabase
      .from('ativos')
      .select('id,tipo,descricao,placa,patrimonio,renavam,chassi,ano_fabricacao,ano_modelo,empresa,arquivo_url,documento_url,documento_nome,observacao')
      .in('tipo', ['veiculo', 'equipamento'])
      .order('created_at', { ascending: false });

    if (error) {
      setAtivos([]);
      toast.error(`Não foi possível carregar a Frota do Supabase: ${error.message}`);
    } else {
      setAtivos((data as unknown as AtivoDoc[]) || []);
    }
    setLoadingAssets(false);
  };

  useEffect(() => {
    void loadAssets();
  }, []);

  const resolveAsset = (item: ParsedItem) => {
    const plate = normalizePlate(item.placa);
    const patrimonio = normalizePatrimonio(item.patrimonio);
    if (plate) {
      const byPlate = ativos.find((asset) => normalizePlate(asset.placa) === plate);
      if (byPlate) return byPlate;
    }
    if (patrimonio) {
      const byPatrimonio = ativos.find((asset) => normalizePatrimonio(asset.patrimonio) === patrimonio);
      if (byPatrimonio) return byPatrimonio;
    }
    return null;
  };

  const readMessage = async () => {
    if (!textoColado.trim()) return toast.error('Cole a mensagem antes de iniciar a leitura.');
    if (!session?.access_token) return toast.error('Sessão expirada. Entre novamente.');
    setParsing(true);
    try {
      const response = await fetch('/api/protocolos-parse', {
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
          ativo: resolveAsset(item),
        })),
      }));

      setGroups(nextGroups);
      setLastSavedIds([]);
      const missing = nextGroups.flatMap((group) => group.itens).filter((item) => !item.ativo || !pdfOf(item.ativo)).length;
      if (missing) {
        toast.warning(`${missing} item(ns) ainda não possuem documento correspondente na Frota.`);
      } else {
        toast.success(`${nextGroups.length} protocolo(s) agrupado(s) por cliente/local com documentos vinculados.`);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível interpretar a mensagem.');
    } finally {
      setParsing(false);
    }
  };

  const updateGroup = (key: string, field: 'cliente' | 'local' | 'responsavel', value: string) => {
    setGroups((current) => current.map((group) => group.key === key ? { ...group, [field]: value } : group));
  };

  const relink = () => {
    setGroups((current) => current.map((group) => ({
      ...group,
      itens: group.itens.map((item) => ({ ...item, ativo: resolveAsset(item) })),
    })));
    toast.success('Vínculos refeitos com a Frota atual.');
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
      <td>${esc(asset?.descricao || item.descricao || 'Equipamento / veículo')}</td>
      <td>${esc(asset?.patrimonio || item.patrimonio || '—')}</td>
      <td>${esc(normalizePlate(asset?.placa || item.placa) || '—')}</td>
      <td>${esc(asset?.renavam || '—')}</td>
      <td>${esc(asset?.chassi || '—')}</td>
    </tr>`;
  }).join('');

  const buildProtocolHtml = (group: ProtocolGroup, via: number) => `
    <section class="protocol-page">
      <header class="protocol-header">
        <div>
          <strong>${esc(topac?.name || 'TOPAC MATRIZ')}</strong>
          <span>CNPJ: ${esc(topac?.cnpj || '')}</span>
        </div>
        <div class="protocol-title">
          PROTOCOLO DE LIBERAÇÃO DE DOCUMENTOS
          <small>${via}ª VIA DE 2</small>
        </div>
      </header>
      <div class="context-grid">
        <div><small>CLIENTE</small><strong>${esc(group.cliente)}</strong></div>
        <div><small>LOCAL / CANTEIRO</small><strong>${esc(group.local)}</strong></div>
        <div><small>RESPONSÁVEL</small><strong>${esc(group.responsavel || '—')}</strong></div>
        <div><small>DATA</small><strong>${esc(new Date(`${dataEmissao}T12:00:00`).toLocaleDateString('pt-BR'))}</strong></div>
      </div>
      <h2>DOCUMENTOS ENTREGUES</h2>
      <table>
        <thead><tr><th>#</th><th>Ativo / Equipamento</th><th>Patrimônio</th><th>Placa</th><th>RENAVAM</th><th>Chassi</th></tr></thead>
        <tbody>${buildRows(group)}</tbody>
      </table>
      <p class="protocol-note">Os itens acima pertencem ao mesmo cliente e local e, por regra operacional, integram este mesmo protocolo.</p>
      <div class="signatures">
        <div><hr/>Assinatura — Entrega</div>
        <div><hr/>Assinatura — Recebimento</div>
      </div>
    </section>`;

  const persistProtocols = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!readiness.ready) {
      toast.error('Complete Cliente/Local e vincule todos os PDFs antes de salvar ou imprimir.');
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
        return {
          empresa_origem: topac?.name || 'TOPAC MATRIZ',
          empresa_destinataria: group.cliente,
          local_canteiro: group.local,
          responsavel_recebimento: group.responsavel || null,
          data_emissao: dataEmissao,
          descricao_ativo: asset.descricao || item.descricao || null,
          placa: normalizePlate(asset.placa || item.placa) || null,
          renavam: asset.renavam || null,
          chassi: asset.chassi || null,
          ano_fabricacao: asset.ano_fabricacao || null,
          ano_modelo: asset.ano_modelo || null,
          patrimonio: asset.patrimonio || item.patrimonio || null,
          exercicio: new Date(`${dataEmissao}T12:00:00`).getFullYear().toString(),
          observacoes: `Grupo automático: ${group.cliente} / ${group.local}`,
          texto_original: textoColado,
          pdf_url: pdfOf(asset),
          ativo_id: asset.id,
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
        observacao: `${groups.length} protocolo(s), agrupamento obrigatório por cliente/local, ${payload.length} documento(s).`,
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

  const printPackage = async () => {
    if (!readiness.ready) {
      toast.error('Impressão bloqueada: complete Cliente/Local e vincule todos os documentos da Frota.');
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
          if (url && !uniqueDocs.has(url)) uniqueDocs.set(url, item.ativo?.documento_nome || item.ativo?.descricao || 'Documento');
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
        .protocol-title small{display:block;margin-top:5px;font-size:10px;color:#666}
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

      printDocumentInPage(html);
      toast.success('Pacote pronto: 2 vias de cada protocolo + 1 via de cada documento vinculado.');
    } catch (error: any) {
      toast.error(`Não foi possível montar o pacote de impressão: ${error?.message || error}`);
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
            <p className="text-sm text-primary-foreground/70">Agrupamento obrigatório por Cliente + Local, com PDFs puxados automaticamente da Frota</p>
          </div>
        </div>
      </div>

      <div className="card-premium space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Mensagem Inteligente</h2>
          <div className="flex gap-2">
            <Input type="date" value={dataEmissao} onChange={(event) => setDataEmissao(event.target.value)} className="w-40" />
            <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
          </div>
        </div>
        <textarea
          value={textoColado}
          onChange={(event) => setTextoColado(event.target.value)}
          placeholder="Cole a mensagem completa. O sistema identifica patrimônios/placas e separa automaticamente por cliente e local."
          className="min-h-40 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void readMessage()} disabled={parsing || loadingAssets}>
            {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {parsing ? 'Interpretando...' : 'Interpretar e montar protocolos'}
          </Button>
          <Button variant="outline" onClick={relink} disabled={!groups.length || loadingAssets}>
            <LinkIcon className="mr-2 h-4 w-4" /> Refazer vínculos com Frota
          </Button>
          <Button variant="outline" onClick={() => void loadAssets()} disabled={loadingAssets}>
            {loadingAssets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Atualizar Frota
          </Button>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="card-premium space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Protocolos encontrados</h2>
              <p className="text-xs text-muted-foreground">{readiness.totalGroups} grupo(s) • {readiness.totalItems} item(ns) • regra: Cliente + Local</p>
            </div>
            <Badge variant={readiness.ready ? 'default' : 'outline'}>
              {readiness.ready ? 'Pronto para imprimir' : `${readiness.missingDocs + readiness.missingContext} pendência(s)`}
            </Badge>
          </div>

          {groups.map((group, groupIndex) => (
            <section key={group.key} className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">Protocolo {groupIndex + 1}</h3>
                <Badge variant="outline">{group.itens.length} item(ns)</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><label className="mb-1 block text-xs text-muted-foreground">Cliente</label><Input value={group.cliente} onChange={(event) => updateGroup(group.key, 'cliente', event.target.value)} placeholder="Cliente" /></div>
                <div><label className="mb-1 block text-xs text-muted-foreground">Local / Canteiro</label><Input value={group.local} onChange={(event) => updateGroup(group.key, 'local', event.target.value)} placeholder="Local" /></div>
                <div><label className="mb-1 block text-xs text-muted-foreground">Responsável</label><Input value={group.responsavel} onChange={(event) => updateGroup(group.key, 'responsavel', event.target.value)} placeholder="Responsável pelo recebimento" /></div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/50">
                    <tr><th className="px-3 py-2 text-left">Ativo</th><th className="px-3 py-2 text-left">Patrimônio</th><th className="px-3 py-2 text-left">Placa</th><th className="px-3 py-2 text-left">Documento</th></tr>
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
                              <span className="inline-flex items-center gap-2 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" /> PDF vinculado</span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-xs font-medium text-destructive"><AlertTriangle className="h-4 w-4" /> Documento faltando</span>
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
                    <summary className="cursor-pointer text-xs font-semibold">Visualizar {item.ativo?.documento_nome || item.ativo?.descricao || url}</summary>
                    <div className="mt-3"><PdfDocumentViewer source={{ url, tipo: 'protocolo' }} title={item.ativo?.descricao || 'Documento da Frota'} /></div>
                  </details>
                ) : null;
              })}
            </section>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="card-premium space-y-4 p-5">
          {!readiness.ready && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              A impressão fica bloqueada enquanto existir Cliente/Local vazio ou item sem PDF vinculado na Frota.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="lg" disabled={saving || !readiness.ready} onClick={() => void persistProtocols()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar protocolos'}
            </Button>
            <Button size="lg" disabled={printing || saving || !readiness.ready} onClick={() => void printPackage()} className="gradient-accent text-accent-foreground">
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              {printing ? 'Montando pacote...' : 'Gerar pacote e imprimir'}
            </Button>
            {lastSavedIds.length > 0 && <span className="self-center text-xs text-success">Arquivado no Supabase: {lastSavedIds.length} registro(s)</span>}
          </div>
          <p className="text-xs text-muted-foreground">Saída obrigatória: 2 vias de cada protocolo e, em seguida, 1 via de cada PDF correspondente. A impressão é disparada pelo navegador.</p>
        </div>
      )}
    </div>
  );
};

export default ProtocoloPage;
