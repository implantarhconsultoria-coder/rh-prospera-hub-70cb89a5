import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { FileCheck, Printer, Sparkles, Upload, Loader2, Search, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AtivoDoc {
  id: string;
  descricao: string;
  placa: string;
  patrimonio: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  empresa: string;
  arquivo_url: string;
  observacao?: string;
}

const ProtocoloPage: React.FC = () => {
  const { companies } = useApp();
  const topac = companies.find(c => c.id === 'topac-matriz');

  const [empresaDestinataria, setEmpresaDestinataria] = useState('');
  const [localCanteiro, setLocalCanteiro] = useState('');
  const [responsavelRecebimento, setResponsavelRecebimento] = useState('');
  const [placa, setPlaca] = useState('');
  const [renavam, setRenavam] = useState('');
  const [chassi, setChassi] = useState('');
  const [anoFabricacao, setAnoFabricacao] = useState('');
  const [anoModelo, setAnoModelo] = useState('');
  const [patrimonio, setPatrimonio] = useState('');
  const [exercicio, setExercicio] = useState(new Date().getFullYear().toString());
  const [descricaoEquipamento, setDescricaoEquipamento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [textoColado, setTextoColado] = useState('');
  const [parsing, setParsing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Auto-lookup state
  const [ativosCache, setAtivosCache] = useState<AtivoDoc[]>([]);
  const [matchedAtivo, setMatchedAtivo] = useState<AtivoDoc | null>(null);
  const [showManualSelect, setShowManualSelect] = useState(false);
  const [ativoSearch, setAtivoSearch] = useState('');
  const hydratingIdsRef = useRef(new Set<string>());
  const lastMatchedIdRef = useRef<string | null>(null);

  // Load all vehicle docs for matching
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('ativos').select('*').eq('tipo', 'veiculo').order('created_at', { ascending: false });
      if (data) setAtivosCache(data as unknown as AtivoDoc[]);
    };
    load();
  }, []);

  const sanitize = (value: string) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hasValue = (value?: string | null) => Boolean(value?.trim());

  const analyzeVehiclePdf = async (sourceUrl: string, fileLabel: string) => {
    const { bytes, pageUrls } = await renderPdfPagesToDataUrls(sourceUrl, 1.15, 2);
    const extractedText = await extractPdfText(bytes).catch(() => '');
    const { data, error } = await supabase.functions.invoke('parse-text', {
      body: {
        text: `Arquivo: ${fileLabel}\n\n${extractedText}`.trim(),
        images: pageUrls,
        type: 'documento_veiculo',
      },
    });

    if (error) throw error;
    return data?.data ?? {};
  };

  const applyMatchedAtivo = (ativo: AtivoDoc) => {
    if (hasValue(ativo.placa)) setPlaca(ativo.placa);
    if (hasValue(ativo.patrimonio)) setPatrimonio(ativo.patrimonio);
    if (hasValue(ativo.renavam)) setRenavam(ativo.renavam);
    if (hasValue(ativo.chassi)) setChassi(ativo.chassi);
    if (hasValue(ativo.ano_fabricacao)) setAnoFabricacao(ativo.ano_fabricacao);
    if (hasValue(ativo.ano_modelo)) setAnoModelo(ativo.ano_modelo);
    if (hasValue(ativo.empresa)) setEmpresaDestinataria(ativo.empresa);
    if (hasValue(ativo.descricao)) setDescricaoEquipamento(ativo.descricao);
    if (hasValue(ativo.observacao) && !hasValue(observacoes)) setObservacoes(ativo.observacao || '');
    if (hasValue(ativo.arquivo_url)) setPdfUrl(ativo.arquivo_url);
  };

  const hydrateMatchedAtivo = async (ativo: AtivoDoc) => {
    if (!ativo.arquivo_url || hydratingIdsRef.current.has(ativo.id)) return;

    const missingFields = {
      patrimonio: !hasValue(ativo.patrimonio),
      renavam: !hasValue(ativo.renavam),
      chassi: !hasValue(ativo.chassi),
      ano_fabricacao: !hasValue(ativo.ano_fabricacao),
      ano_modelo: !hasValue(ativo.ano_modelo),
      empresa: !hasValue(ativo.empresa),
      descricao: !hasValue(ativo.descricao),
      observacao: !hasValue(ativo.observacao),
    };

    if (!Object.values(missingFields).some(Boolean)) return;

    hydratingIdsRef.current.add(ativo.id);
    setLoadingPdf(true);

    try {
      const extracted = await analyzeVehiclePdf(ativo.arquivo_url, ativo.descricao || ativo.placa || 'Documento do veículo');
      const updates: Record<string, string> = {};

      Object.entries(missingFields).forEach(([field, shouldFill]) => {
        const nextValue = extracted?.[field];
        if (shouldFill && typeof nextValue === 'string' && nextValue.trim()) {
          updates[field] = nextValue.trim();
        }
      });

      if (Object.keys(updates).length === 0) return;

      const hydratedAtivo = { ...ativo, ...updates } as AtivoDoc;
      const { error } = await supabase.from('ativos').update(updates as any).eq('id', ativo.id);
      if (error) throw error;

      setAtivosCache((current) => current.map((item) => (item.id === ativo.id ? hydratedAtivo : item)));
      setMatchedAtivo(hydratedAtivo);
      applyMatchedAtivo(hydratedAtivo);
      toast.success('Dados do veículo atualizados a partir do PDF salvo no sistema.');
    } catch {
      toast.error('Não foi possível complementar os dados do veículo pelo PDF.');
    } finally {
      hydratingIdsRef.current.delete(ativo.id);
      setLoadingPdf(false);
    }
  };

  // Auto-match when key fields change — auto-fill ALL vehicle fields
  useEffect(() => {
    if (!placa && !patrimonio && !renavam && !chassi) {
      setMatchedAtivo(null);
      lastMatchedIdRef.current = null;
      return;
    }

    const normalizedPlaca = sanitize(placa);
    const normalizedPatrimonio = patrimonio.trim().toLowerCase();
    const normalizedRenavam = renavam.trim();
    const normalizedChassi = chassi.trim().toLowerCase();

    const plateMatch = normalizedPlaca
      ? ativosCache.find((a) => hasValue(a.placa) && sanitize(a.placa) === normalizedPlaca)
      : null;

    const match = plateMatch || ativosCache.find(a => {
      if (normalizedPatrimonio && hasValue(a.patrimonio) && a.patrimonio.toLowerCase() === normalizedPatrimonio) return true;
      if (normalizedRenavam && hasValue(a.renavam) && a.renavam === normalizedRenavam) return true;
      if (normalizedChassi && hasValue(a.chassi) && a.chassi.toLowerCase() === normalizedChassi) return true;
      return false;
    });

    if (match) {
      setMatchedAtivo(match);
      applyMatchedAtivo(match);

      if (lastMatchedIdRef.current !== match.id) {
        toast.success(`Veículo localizado: ${match.descricao || match.placa} — campos preenchidos automaticamente.`);
        lastMatchedIdRef.current = match.id;
      }

      hydrateMatchedAtivo(match);
    } else {
      setMatchedAtivo(null);
      lastMatchedIdRef.current = null;
    }
  }, [placa, patrimonio, renavam, chassi, ativosCache]);

  const filteredAtivos = useMemo(() => {
    if (!ativoSearch || ativoSearch.length < 2) return [];
    const q = ativoSearch.toLowerCase();
    return ativosCache.filter(a =>
      (a.descricao || '').toLowerCase().includes(q) ||
      (a.placa || '').toLowerCase().includes(q) ||
      (a.patrimonio || '').toLowerCase().includes(q) ||
      (a.renavam || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [ativoSearch, ativosCache]);

  const handleParseText = async () => {
    if (!textoColado.trim()) { toast.error('Cole o texto primeiro'); return; }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: { text: textoColado, type: 'protocolo' },
      });
      if (error) throw error;
      const d = data?.data;
      if (d) {
        if (d.empresa_destinataria) setEmpresaDestinataria(d.empresa_destinataria);
        if (d.local_canteiro) setLocalCanteiro(d.local_canteiro);
        if (d.responsavel_recebimento) setResponsavelRecebimento(d.responsavel_recebimento);
        if (d.placa) setPlaca(d.placa);
        if (d.patrimonio) setPatrimonio(d.patrimonio);
        if (d.renavam) setRenavam(d.renavam);
        if (d.chassi) setChassi(d.chassi);
        if (d.ano_fabricacao) setAnoFabricacao(d.ano_fabricacao);
        if (d.ano_modelo) setAnoModelo(d.ano_modelo);
        if (d.empresa) setEmpresaDestinataria(d.empresa);
        if (d.descricao_ativo) setDescricaoEquipamento(d.descricao_ativo);
        if (d.observacoes) setObservacoes(d.observacoes);
        toast.success('Campos preenchidos pela IA — revise e edite antes de imprimir.');
      }
    } catch (e: any) {
      toast.error('Erro ao processar texto: ' + (e.message || 'Tente novamente'));
    } finally {
      setParsing(false);
    }
  };

  const handleSelectAtivo = (a: AtivoDoc) => {
    setMatchedAtivo(a);
    applyMatchedAtivo(a);
    setShowManualSelect(false);
    setAtivoSearch('');
    hydrateMatchedAtivo(a);
    toast.success('Documento vinculado! PDF carregado automaticamente.');
  };

  const handlePdfUpload = async (file: File) => {
    setPdfFile(file);
    const fileName = `protocolo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('documentos-ativos').upload(fileName, file, { contentType: 'application/pdf' });
    if (error) { toast.error('Erro no upload'); return; }
    const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setPdfUrl(urlData.publicUrl);
    toast.success('PDF anexado!');
  };

  const titulo = 'PROTOCOLO DE LIBERAÇÃO DE DOCUMENTO';

  const buildProtocoloHtml = (via: number, total: number) => {
    const co = topac;
    return `<div style="page-break-after:always;padding:15mm;font-family:Arial,sans-serif;font-size:12px;color:#000;box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px">
      <div><strong>${co?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
      <div style="font-size:14px;font-weight:bold;text-align:right">${titulo}<br/><span style="font-size:10px;color:#666">${via}ª Via de ${total}</span></div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Dados da Liberação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px">
        <div><span style="color:#666">Empresa Destinatária:</span> ${empresaDestinataria}</div>
        <div><span style="color:#666">Local/Canteiro:</span> ${localCanteiro || '—'}</div>
        <div><span style="color:#666">Responsável Recebimento:</span> ${responsavelRecebimento || '—'}</div>
        <div><span style="color:#666">Data:</span> ${new Date(dataEmissao).toLocaleDateString('pt-BR')}</div>
        ${descricaoEquipamento ? `<div style="grid-column:1/-1"><span style="color:#666">Descrição:</span> ${descricaoEquipamento}</div>` : ''}
      </div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Identificação do Ativo</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px">
        <div><span style="color:#666">Placa:</span> ${placa || '—'}</div>
        <div><span style="color:#666">Renavam:</span> ${renavam || '—'}</div>
        <div><span style="color:#666">Chassi:</span> ${chassi || '—'}</div>
        <div><span style="color:#666">Ano Fabricação:</span> ${anoFabricacao || '—'}</div>
        <div><span style="color:#666">Ano Modelo:</span> ${anoModelo || '—'}</div>
        <div><span style="color:#666">Patrimônio:</span> ${patrimonio || '—'}</div>
        <div><span style="color:#666">Exercício:</span> ${exercicio}</div>
      </div>
    </div>
    ${observacoes ? `<div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px"><div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Observações</div><p style="font-size:11px;margin:0;white-space:pre-wrap">${observacoes}</p></div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:60px">
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Entrega</small></div>
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Recebimento</small></div>
    </div>
    <div style="margin-top:20px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px">Topac RH Multiempresa PRO — Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>`;
  };

  const handlePrint = async () => {
    if (!placa && !patrimonio && !descricaoEquipamento) {
      toast.error('Informe ao menos placa, patrimônio ou descrição');
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    // Build protocol HTML (2 vias)
    let fullHtml = buildProtocoloHtml(1, 2) + buildProtocoloHtml(2, 2);

    // If there's a PDF, render the real document pages and append to the print flow
    if (pdfUrl) {
      try {
        const { pageUrls } = await renderPdfPagesToDataUrls(pdfUrl, 1.6);
        fullHtml += pageUrls.map((pageUrl, index) => `
          <div class="pdf-print-page" style="${index === 0 ? 'page-break-before:always;' : ''}">
            <img src="${pageUrl}" alt="Documento do veículo página ${index + 1}" style="display:block;width:100%;height:auto" />
          </div>
        `).join('');
      } catch {
        toast.error('Não foi possível incorporar o PDF na impressão');
      }
    }

    printWin.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}.pdf-print-page{padding:0;margin:0}.pdf-print-page img{display:block;width:100%;height:auto}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    ${fullHtml}
    </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 800);
  };

  const handleClear = () => {
    setEmpresaDestinataria(''); setLocalCanteiro(''); setResponsavelRecebimento('');
    setPlaca(''); setRenavam(''); setChassi(''); setAnoFabricacao(''); setAnoModelo('');
    setPatrimonio(''); setDescricaoEquipamento(''); setObservacoes('');
    setTextoColado(''); setPdfFile(null); setPdfUrl('');
    setMatchedAtivo(null); setShowManualSelect(false);
    lastMatchedIdRef.current = null;
    setExercicio(new Date().getFullYear().toString());
    setDataEmissao(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <FileCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Protocolo / Liberação de Documento</h1>
            <p className="text-primary-foreground/70 text-sm">Empresa padrão: TOPAC MATRIZ — Localização automática de documentos cadastrados</p>
          </div>
        </div>
      </div>

      {/* Leitura IA */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Leitura Inteligente de Texto
          </h2>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground">
            Limpar Campos
          </Button>
        </div>
        <textarea
          value={textoColado}
          onChange={e => setTextoColado(e.target.value)}
          placeholder="Cole aqui o texto de WhatsApp, e-mail ou mensagem com os dados do documento. A IA vai sugerir o preenchimento — você pode revisar e editar tudo antes de salvar ou imprimir."
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[140px] resize-y"
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleParseText} disabled={parsing} variant="outline">
            {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {parsing ? 'Lendo texto...' : 'Ler texto e preencher'}
          </Button>
          <span className="text-xs text-muted-foreground">Os campos serão preenchidos automaticamente. Revise antes de imprimir.</span>
        </div>
      </div>

      {/* Dados da liberação */}
      <div className="card-premium p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Dados da Liberação</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><label className="text-xs text-muted-foreground block mb-1">Empresa Destinatária</label>
            <Input value={empresaDestinataria} onChange={e => setEmpresaDestinataria(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Local / Canteiro</label>
            <Input value={localCanteiro} onChange={e => setLocalCanteiro(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Responsável pelo Recebimento</label>
            <Input value={responsavelRecebimento} onChange={e => setResponsavelRecebimento(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Data de Emissão</label>
            <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} /></div>
          <div className="lg:col-span-2"><label className="text-xs text-muted-foreground block mb-1">Descrição do Ativo / Equipamento</label>
            <Input value={descricaoEquipamento} onChange={e => setDescricaoEquipamento(e.target.value)} placeholder="Ex: Veículo, Compressor, Equipamento..." /></div>
        </div>
      </div>

      {/* Identificação do ativo */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Identificação do Ativo</h2>
          {matchedAtivo && (
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 px-3 py-1 rounded-full">
              <LinkIcon className="w-3 h-3" />
              Documento vinculado: {matchedAtivo.descricao || matchedAtivo.placa}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><label className="text-xs text-muted-foreground block mb-1">Placa</label>
            <Input value={placa} onChange={e => setPlaca(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Renavam</label>
            <Input value={renavam} onChange={e => setRenavam(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Chassi</label>
            <Input value={chassi} onChange={e => setChassi(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Ano Fabricação</label>
            <Input value={anoFabricacao} onChange={e => setAnoFabricacao(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Ano Modelo</label>
            <Input value={anoModelo} onChange={e => setAnoModelo(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Patrimônio</label>
            <Input value={patrimonio} onChange={e => setPatrimonio(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Exercício</label>
            <Input value={exercicio} onChange={e => setExercicio(e.target.value)} /></div>
        </div>

        {!matchedAtivo && (placa || patrimonio || renavam || chassi) && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm">
            <span className="text-warning font-medium">Nenhum documento correspondente encontrado automaticamente.</span>
            <Button variant="link" size="sm" className="text-primary ml-2" onClick={() => setShowManualSelect(true)}>
              Selecionar manualmente
            </Button>
          </div>
        )}

        {showManualSelect && (
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar documento por descrição, placa ou patrimônio..."
                value={ativoSearch} onChange={e => setAtivoSearch(e.target.value)} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setShowManualSelect(false)}>Fechar</Button>
            </div>
            {filteredAtivos.length > 0 && (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {filteredAtivos.map(a => (
                  <button key={a.id} onClick={() => handleSelectAtivo(a)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex justify-between items-center border-b last:border-0">
                    <span className="font-medium">{a.descricao}</span>
                    <span className="text-xs text-muted-foreground">{a.placa || a.patrimonio || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Observações + PDF + Imprimir */}
      <div className="card-premium p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[80px] resize-y" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PDF do Documento</label>
            {matchedAtivo?.arquivo_url && pdfUrl === matchedAtivo.arquivo_url ? (
              <div className="text-xs text-success bg-success/10 rounded-lg p-3 flex items-center gap-2">
                <LinkIcon className="w-3 h-3" />
                PDF carregado automaticamente de Doc. Veículos
                <Button variant="ghost" size="sm" className="text-xs ml-auto"
                  onClick={() => { setPdfUrl(''); setPdfFile(null); }}>Trocar</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 text-sm">
                  <Upload className="w-4 h-4" />
                  {pdfFile ? pdfFile.name : 'Selecionar PDF'}
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
                </label>
              </div>
            )}
            {pdfUrl && (
              <div className="space-y-2 mt-1">
                <p className="text-xs text-success">✓ PDF vinculado — será impresso como via adicional</p>
                {loadingPdf && <p className="text-xs text-muted-foreground">Carregando PDF...</p>}
                <PdfDocumentViewer sourceUrl={pdfUrl} title="PDF do documento" />
              </div>
            )}
            {!pdfUrl && <p className="text-xs text-muted-foreground mt-1">Sem PDF: imprime apenas 2 vias do protocolo</p>}
          </div>
        </div>
        <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold" size="lg">
          <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir — {pdfUrl ? '2 vias + Documento Anexo' : '2 vias'}
        </Button>
      </div>
    </div>
  );
};

export default ProtocoloPage;
