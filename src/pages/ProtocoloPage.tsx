import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileCheck, Printer, Sparkles, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [observacoes, setObservacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [textoColado, setTextoColado] = useState('');
  const [parsing, setParsing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');

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
        if (d.ano_modelo) setAnoModelo(d.ano_modelo);
        if (d.observacoes) setObservacoes(d.observacoes);
        toast.success('Campos preenchidos automaticamente!');
      }
    } catch (e: any) {
      toast.error('Erro ao processar texto: ' + (e.message || 'Tente novamente'));
    } finally {
      setParsing(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setPdfFile(file);
    const fileName = `protocolo-${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('documentos-ativos')
      .upload(fileName, file, { contentType: 'application/pdf' });
    if (error) { toast.error('Erro no upload'); return; }
    const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setPdfUrl(urlData.publicUrl);
    toast.success('PDF anexado!');
  };

  const buildProtocoloHtml = (via: number) => {
    const co = topac;
    return `<div style="page-break-after:always;padding:15mm;font-family:Arial,sans-serif;font-size:12px;color:#000">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
      <div><strong>${co?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
      <div style="font-size:16px;font-weight:bold;text-align:right">PROTOCOLO DE<br/>LIBERAÇÃO DE DOCUMENTO<br/><span style="font-size:10px;color:#666">${via}ª Via</span></div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Dados da Liberação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
        <div style="font-size:11px"><span style="color:#666">Empresa Destinatária:</span> ${empresaDestinataria}</div>
        <div style="font-size:11px"><span style="color:#666">Local/Canteiro:</span> ${localCanteiro || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Responsável Recebimento:</span> ${responsavelRecebimento}</div>
        <div style="font-size:11px"><span style="color:#666">Data:</span> ${new Date(dataEmissao).toLocaleDateString('pt-BR')}</div>
      </div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Identificação do Ativo</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
        <div style="font-size:11px"><span style="color:#666">Placa:</span> ${placa || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Renavam:</span> ${renavam || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Chassi:</span> ${chassi || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Ano Fabricação:</span> ${anoFabricacao || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Ano Modelo:</span> ${anoModelo || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Patrimônio:</span> ${patrimonio || '—'}</div>
        <div style="font-size:11px"><span style="color:#666">Exercício:</span> ${exercicio}</div>
      </div>
    </div>
    ${observacoes ? `<div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px"><div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Observações</div><p style="font-size:11px">${observacoes}</p></div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:60px">
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Entrega</small></div>
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Recebimento</small></div>
    </div>
    <div style="margin-top:30px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px">Topac RH Multiempresa PRO — Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>`;
  };

  const handlePrint = () => {
    if (!placa && !patrimonio) { toast.error('Informe ao menos placa ou patrimônio'); return; }
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    
    let pdfPage = '';
    if (pdfUrl) {
      pdfPage = `<div style="page-break-after:always;height:100vh;display:flex;align-items:center;justify-content:center;">
        <iframe src="${pdfUrl}" style="width:100%;height:95vh;border:none"></iframe>
      </div>`;
    }

    printWin.document.write(`<!DOCTYPE html><html><head><title>Protocolo de Liberação</title>
    <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
    ${buildProtocoloHtml(1)}
    ${buildProtocoloHtml(2)}
    ${pdfPage}
    </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 500);
    toast.success('Protocolo gerado — 2 vias' + (pdfUrl ? ' + documento anexo' : ''));
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
            <p className="text-primary-foreground/70 text-sm">Empresa padrão: TOPAC MATRIZ — Cole texto de WhatsApp/e-mail para preencher automaticamente</p>
          </div>
        </div>
      </div>

      {/* Área de texto colado */}
      <div className="card-premium p-5 space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Leitura Inteligente de Texto
        </h2>
        <textarea
          value={textoColado}
          onChange={e => setTextoColado(e.target.value)}
          placeholder="Cole aqui o texto de WhatsApp ou e-mail com os dados do documento para preenchimento automático..."
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[120px]"
        />
        <Button onClick={handleParseText} disabled={parsing} variant="outline">
          {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {parsing ? 'Lendo texto...' : 'Ler texto e preencher'}
        </Button>
      </div>

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
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Identificação do Ativo</h2>
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
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PDF do Documento (opcional)</label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 text-sm">
                <Upload className="w-4 h-4" />
                {pdfFile ? pdfFile.name : 'Selecionar PDF'}
                <input type="file" accept=".pdf" className="hidden"
                  onChange={e => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
              </label>
            </div>
            {pdfUrl && <p className="text-xs text-success mt-1">✓ PDF anexado — será impresso como 3ª via</p>}
          </div>
        </div>
        <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
          <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir — {pdfUrl ? '2 vias + Documento' : '2 vias'}
        </Button>
      </div>
    </div>
  );
};

export default ProtocoloPage;
