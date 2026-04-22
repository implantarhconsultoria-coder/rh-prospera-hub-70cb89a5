import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cog, Printer } from 'lucide-react';
import { toast } from 'sonner';

const CompressoresPage: React.FC = () => {
  const { companies } = useApp();
  const topac = companies.find(c => c.id === 'topac-matriz');

  const [empresaContratante, setEmpresaContratante] = useState('');
  const [pessoaRecebimento, setPessoaRecebimento] = useState('');
  const [descricaoCompressor, setDescricaoCompressor] = useState('');
  const [placa, setPlaca] = useState('');
  const [renavam, setRenavam] = useState('');
  const [chassi, setChassi] = useState('');
  const [patrimonio, setPatrimonio] = useState('');
  const [ano, setAno] = useState('');
  const [exercicio, setExercicio] = useState(new Date().getFullYear().toString());
  const [observacoes, setObservacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));

  const buildVia = () => {
    const co = topac;
    return `<div style="page-break-inside:avoid;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div><strong>${co?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
    <div style="font-size:16px;font-weight:bold;text-align:right">LIBERAÇÃO DE<br/>LOCAÇÃO DE COMPRESSOR</div></div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
    <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Dados da Locação</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px">
    <div><span style="color:#666">Empresa Contratante:</span> ${empresaContratante}</div>
    <div><span style="color:#666">Pessoa que Recebe:</span> ${pessoaRecebimento}</div>
    <div><span style="color:#666">Compressor:</span> ${descricaoCompressor}</div>
    <div><span style="color:#666">Data:</span> ${new Date(dataEmissao).toLocaleDateString('pt-BR')}</div>
    <div><span style="color:#666">Placa:</span> ${placa || '—'}</div>
    <div><span style="color:#666">Renavam:</span> ${renavam || '—'}</div>
    <div><span style="color:#666">Chassi:</span> ${chassi || '—'}</div>
    <div><span style="color:#666">Patrimônio:</span> ${patrimonio || '—'}</div>
    <div><span style="color:#666">Ano:</span> ${ano || '—'}</div>
    <div><span style="color:#666">Exercício:</span> ${exercicio}</div>
    </div></div>
    ${observacoes ? `<div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px"><div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Observações</div><p style="font-size:11px">${observacoes}</p></div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:40px">
    <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Entrega</small></div>
    <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Recebimento</small></div>
    </div></div>`;
  };

  const handlePrint = () => {
    if (!descricaoCompressor) { toast.error('Informe a descrição do compressor'); return; }
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Liberação de Compressor</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    .footer{margin-top:20px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px}
    </style></head><body>
    <p style="text-align:center;font-size:10px;color:#999;margin-bottom:10px">1ª VIA — EMPRESA</p>
    ${buildVia()}
    <hr style="border:0;border-top:1px dashed #ccc;margin:30px 0"/>
    <p style="text-align:center;font-size:10px;color:#999;margin-bottom:10px">2ª VIA — CONTRATANTE</p>
    ${buildVia()}
    <!-- rodapé limpo -->
    </body></html>`);
    printWin.document.close();
    printWin.print();
    toast.success('Liberação gerada com 2 vias!');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Cog className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Liberação de Locação de Compressores</h1>
            <p className="text-primary-foreground/70 text-sm">Empresa padrão: TOPAC MATRIZ — Gera 2 vias</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Dados da Locação</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><label className="text-xs text-muted-foreground block mb-1">Empresa Contratante</label>
            <Input value={empresaContratante} onChange={e => setEmpresaContratante(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Pessoa que Recebe</label>
            <Input value={pessoaRecebimento} onChange={e => setPessoaRecebimento(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Descrição do Compressor</label>
            <Input value={descricaoCompressor} onChange={e => setDescricaoCompressor(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Placa</label>
            <Input value={placa} onChange={e => setPlaca(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Renavam</label>
            <Input value={renavam} onChange={e => setRenavam(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Chassi</label>
            <Input value={chassi} onChange={e => setChassi(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Patrimônio</label>
            <Input value={patrimonio} onChange={e => setPatrimonio(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Ano</label>
            <Input value={ano} onChange={e => setAno(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Exercício</label>
            <Input value={exercicio} onChange={e => setExercicio(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Data de Emissão</label>
            <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} /></div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <label className="text-xs text-muted-foreground">Observações</label>
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" />
        <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
          <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir (2 Vias)
        </Button>
      </div>
    </div>
  );
};

export default CompressoresPage;
