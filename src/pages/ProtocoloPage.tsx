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

  const [tipoDocumento, setTipoDocumento] = useState<'protocolo' | 'compressor'>('protocolo');
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
        toast.success('Campos preenchidos pela IA — revise e edite antes de imprimir.');
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
    const { error } = await supabase.storage.from('documentos-ativos').upload(fileName, file, { contentType: 'application/pdf' });
    if (error) { toast.error('Erro no upload'); return; }
    const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setPdfUrl(urlData.publicUrl);
    toast.success('PDF anexado!');
  };

  const titulo = tipoDocumento === 'compressor' ? 'LIBERAÇÃO DE LOCAÇÃO DE COMPRESSOR' : 'PROTOCOLO DE LIBERAÇÃO DE DOCUMENTO';

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
        ${descricaoEquipamento ? `<div style="grid-column:1/-1"><span style="color:#666">Equipamento:</span> ${descricaoEquipamento}</div>` : ''}
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

  const handlePrint = () => {
    if (!placa && !patrimonio && !descricaoEquipamento) {
      toast.error('Informe ao menos placa, patrimônio ou descrição do equipamento');
      return;
    }
    const printWin = window.open('', '_blank');
    if (!printWin) return;

    let pdfPage = '';
    if (pdfUrl) {
      pdfPage = `<div style="page-break-after:always;padding:15mm;">
        <div style="text-align:center;font-size:10px;color:#666;margin-bottom:10px">DOCUMENTO ANEXO — Referente ao Protocolo de ${new Date(dataEmissao).toLocaleDateString('pt-BR')}</div>
        <iframe src="${pdfUrl}" style="width:100%;height:90vh;border:1px solid #ccc"></iframe>
      </div>`;
    }

    printWin.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
    ${buildProtocoloHtml(1, 2)}
    ${buildProtocoloHtml(2, 2)}
    ${pdfPage}
    </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 500);
    toast.success(`Protocolo gerado — 2 vias${pdfUrl ? ' + documento anexo' : ''}`);
  };

  const handleClear = () => {
    setEmpresaDestinataria(''); setLocalCanteiro(''); setResponsavelRecebimento('');
    setPlaca(''); setRenavam(''); setChassi(''); setAnoFabricacao(''); setAnoModelo('');
    setPatrimonio(''); setDescricaoEquipamento(''); setObservacoes('');
    setTextoColado(''); setPdfFile(null); setPdfUrl('');
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
            <p className="text-primary-foreground/70 text-sm">Empresa padrão: TOPAC MATRIZ — Inclui liberação de compressores</p>
          </div>
        </div>
      </div>

      {/* Tipo + Leitura IA */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo de Documento</label>
            <select value={tipoDocumento} onChange={e => setTipoDocumento(e.target.value as any)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="protocolo">Protocolo de Documento</option>
              <option value="compressor">Liberação de Compressor</option>
            </select>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground">
              Limpar Campos
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" /> Leitura Inteligente de Texto
          </h2>
          <textarea
            value={textoColado}
            onChange={e => setTextoColado(e.target.value)}
            placeholder="Cole aqui o texto de WhatsApp, e-mail ou mensagem com os dados do documento. A IA vai sugerir o preenchimento — você pode revisar e editar tudo antes de salvar ou imprimir."
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[140px] resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <Button onClick={handleParseText} disabled={parsing} variant="outline">
              {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {parsing ? 'Lendo texto...' : 'Ler texto e preencher'}
            </Button>
            <span className="text-xs text-muted-foreground">Os campos serão preenchidos automaticamente. Revise antes de imprimir.</span>
          </div>
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
          {tipoDocumento === 'compressor' && (
            <div className="lg:col-span-2"><label className="text-xs text-muted-foreground block mb-1">Descrição do Compressor / Equipamento</label>
              <Input value={descricaoEquipamento} onChange={e => setDescricaoEquipamento(e.target.value)} placeholder="Ex: Compressor Atlas Copco XAS 185" /></div>
          )}
        </div>
      </div>

      {/* Identificação do ativo */}
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

      {/* Observações + PDF + Imprimir */}
      <div className="card-premium p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[80px] resize-y" />
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
            {pdfUrl && <p className="text-xs text-success mt-1">✓ PDF anexado — será impresso como via adicional</p>}
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
