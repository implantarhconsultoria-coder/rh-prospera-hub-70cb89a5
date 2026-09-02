import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, Eye, FileText, Printer } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Aviso = 'cumprir' | 'nao_cumprir' | 'solicitar_dispensa';
type Motivo = 'pessoais' | 'nova_oportunidade' | 'outro' | 'nao_informar';

type EmpresaDetalhe = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
};

const clean = (value: unknown) => String(value ?? '').trim();
const escapeHtml = (value: unknown) => clean(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const mapEmpresa = (row: any): EmpresaDetalhe => ({
  id: clean(row?.id),
  razaoSocial: clean(row?.razao_social || row?.nome || row?.name),
  nomeFantasia: clean(row?.nome_fantasia || row?.fantasia),
  cnpj: clean(row?.cnpj),
  endereco: clean(row?.endereco || row?.logradouro),
  numero: clean(row?.numero || row?.numero_endereco),
  complemento: clean(row?.complemento),
  bairro: clean(row?.bairro),
  cidade: clean(row?.cidade),
  estado: clean(row?.estado || row?.uf),
  cep: clean(row?.cep),
});

const enderecoCompleto = (empresa: EmpresaDetalhe | null) => {
  if (!empresa) return '';
  const rua = [empresa.endereco, empresa.numero].filter(Boolean).join(', ');
  const complemento = [empresa.complemento, empresa.bairro].filter(Boolean).join(' - ');
  const cidadeUf = [empresa.cidade, empresa.estado].filter(Boolean).join('/');
  const cep = empresa.cep ? `CEP ${empresa.cep}` : '';
  return [rua, complemento, [cidadeUf, cep].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
};

const avisoTexto: Record<Aviso, string> = {
  cumprir: 'Informo que cumprirei normalmente o período de aviso prévio, conforme orientação da empresa.',
  nao_cumprir: 'Informo que não cumprirei o aviso prévio, estando ciente das respectivas consequências e dos eventuais descontos cabíveis em minha rescisão.',
  solicitar_dispensa: 'Solicito, se possível, a dispensa do cumprimento do aviso prévio, ficando ciente de que o pedido dependerá da concordância da empresa.',
};

const motivoTexto: Record<Motivo, string> = {
  pessoais: 'Motivos pessoais',
  nova_oportunidade: 'Nova oportunidade profissional',
  outro: 'Outro',
  nao_informar: '',
};

const PedidoDemissaoModelDialog: React.FC = () => {
  const { companies, employees } = useApp();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [empresa, setEmpresa] = useState<EmpresaDetalhe | null>(null);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [aviso, setAviso] = useState<Aviso>('cumprir');
  const [motivo, setMotivo] = useState<Motivo>('nao_informar');
  const [motivoOutro, setMotivoOutro] = useState('');

  const funcionario = employees.find((item) => item.id === employeeId) || null;
  const funcionariosEmpresa = useMemo(() => employees
    .filter((item) => item.companyId === companyId && item.status !== 'excluido')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [companyId, employees]);

  useEffect(() => {
    setEmployeeId('');
    setEmpresa(null);
    if (!companyId) return;
    let active = true;
    setLoadingEmpresa(true);
    supabase.from('empresas').select('*').eq('id', companyId).single().then(({ data, error }) => {
      if (!active) return;
      setLoadingEmpresa(false);
      if (!error && data) {
        setEmpresa(mapEmpresa(data));
        return;
      }
      const fallback = companies.find((item) => item.id === companyId);
      setEmpresa(fallback ? {
        id: fallback.id,
        razaoSocial: fallback.name,
        nomeFantasia: '',
        cnpj: fallback.cnpj,
        endereco: '', numero: '', complemento: '', bairro: '',
        cidade: fallback.city, estado: '', cep: '',
      } : null);
      toast.warning('Dados complementares da empresa não foram carregados. Confira o cadastro antes de imprimir.');
    });
    return () => { active = false; };
  }, [companyId, companies]);

  const motivoFinal = motivo === 'outro' ? motivoOutro.trim() : motivoTexto[motivo];
  const empresaNome = empresa?.razaoSocial || empresa?.nomeFantasia || '';
  const endereco = enderecoCompleto(empresa);
  const cidade = empresa?.cidade || '';

  const validar = () => {
    if (!empresa || !funcionario) {
      toast.error('Selecione a empresa e o funcionário.');
      return false;
    }
    if (!empresaNome || !empresa.cnpj) {
      toast.error('A empresa precisa ter razão social/nome e CNPJ cadastrados.');
      return false;
    }
    if (!funcionario.name || !funcionario.cpf || !funcionario.cargo) {
      toast.error('O funcionário precisa ter nome, CPF e cargo preenchidos.');
      return false;
    }
    if (motivo === 'outro' && !motivoOutro.trim()) {
      toast.error('Digite o motivo ou selecione “Não informar”.');
      return false;
    }
    return true;
  };

  const htmlCarta = () => {
    const motivoHtml = motivoFinal ? `<p><strong>Motivo:</strong> ${escapeHtml(motivoFinal)}</p>` : '';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta de Pedido de Demissão</title><style>@page{size:A4 portrait;margin:18mm 20mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:11.5pt;line-height:1.45}.nota{text-align:center;font-size:8.5pt;color:#666;margin-bottom:10mm}.titulo{text-align:center;font-weight:700;font-size:14pt;margin-bottom:10mm}.dest p{margin:0 0 2mm}.dest{margin-bottom:7mm}.texto p{margin:0 0 5mm;text-align:justify}.data{margin-top:8mm}.assinatura{text-align:center;margin-top:14mm}.linha{width:82mm;border-top:1px solid #111;margin:0 auto 3mm}.nome{font-weight:600}</style></head><body><div class="nota">MODELO PARA SER COPIADO DE PRÓPRIO PUNHO PELO FUNCIONÁRIO</div><div class="titulo">CARTA DE PEDIDO DE DEMISSÃO</div><div class="dest"><p>À</p><p><strong>${escapeHtml(empresaNome)}</strong></p><p>CNPJ: ${escapeHtml(empresa?.cnpj)}</p>${endereco ? `<p>${escapeHtml(endereco)}</p>` : ''}</div><div class="texto"><p>Eu, <strong>${escapeHtml(funcionario?.name)}</strong>, inscrito(a) no CPF nº <strong>${escapeHtml(funcionario?.cpf)}</strong>, ocupante do cargo de <strong>${escapeHtml(funcionario?.cargo)}</strong>, venho por meio desta solicitar o meu desligamento do quadro de funcionários desta empresa, por livre e espontânea vontade.</p>${motivoHtml}<p>${escapeHtml(avisoTexto[aviso])}</p><p>Declaro estar ciente de que, por se tratar de pedido de demissão, não farei jus aos direitos específicos da dispensa sem justa causa, como multa de 40% sobre o FGTS, saque rescisório do FGTS e seguro-desemprego, permanecendo preservados os demais direitos rescisórios legalmente aplicáveis.</p><p>Agradeço pela oportunidade e pela confiança depositada em meu trabalho.</p><p>Solicito que sejam tomadas as providências necessárias para a formalização do meu desligamento.</p></div><div class="data">${escapeHtml(cidade)}, ____ de __________________ de ______.</div><div class="assinatura"><div class="linha"></div><div class="nome">${escapeHtml(funcionario?.name)}</div></div></body></html>`;
  };

  const imprimir = () => {
    if (!validar()) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão.');
    win.document.open();
    win.document.write(htmlCarta());
    win.document.close();
    window.setTimeout(() => { win.focus(); win.print(); }, 250);
  };

  const baixarPdf = () => {
    if (!validar()) return;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const left = 20;
    const width = 170;
    let y = 18;
    const paragraph = (text: string, gap = 3.5) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.3);
      const lines = pdf.splitTextToSize(text, width);
      pdf.text(lines, left, y, { maxWidth: width });
      y += lines.length * 4.4 + gap;
    };
    pdf.setTextColor(90);
    pdf.setFontSize(8);
    pdf.text('MODELO PARA SER COPIADO DE PRÓPRIO PUNHO PELO FUNCIONÁRIO', 105, y, { align: 'center' });
    y += 11;
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('CARTA DE PEDIDO DE DEMISSÃO', 105, y, { align: 'center' });
    y += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.3);
    pdf.text('À', left, y); y += 6;
    pdf.setFont('helvetica', 'bold'); pdf.text(empresaNome, left, y); y += 6;
    pdf.setFont('helvetica', 'normal'); pdf.text(`CNPJ: ${empresa?.cnpj || ''}`, left, y); y += 6;
    if (endereco) { const lines = pdf.splitTextToSize(endereco, width); pdf.text(lines, left, y); y += lines.length * 4.4 + 5; }
    paragraph(`Eu, ${funcionario?.name || ''}, inscrito(a) no CPF nº ${funcionario?.cpf || ''}, ocupante do cargo de ${funcionario?.cargo || ''}, venho por meio desta solicitar o meu desligamento do quadro de funcionários desta empresa, por livre e espontânea vontade.`);
    if (motivoFinal) paragraph(`Motivo: ${motivoFinal}`);
    paragraph(avisoTexto[aviso]);
    paragraph('Declaro estar ciente de que, por se tratar de pedido de demissão, não farei jus aos direitos específicos da dispensa sem justa causa, como multa de 40% sobre o FGTS, saque rescisório do FGTS e seguro-desemprego, permanecendo preservados os demais direitos rescisórios legalmente aplicáveis.');
    paragraph('Agradeço pela oportunidade e pela confiança depositada em meu trabalho.');
    paragraph('Solicito que sejam tomadas as providências necessárias para a formalização do meu desligamento.');
    y += 2;
    pdf.text(`${cidade}, ____ de __________________ de ______.`, left, y);
    y += 18;
    pdf.line(64, y, 146, y);
    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.text(funcionario?.name || '', 105, y, { align: 'center' });
    const safeName = (funcionario?.name || 'funcionario').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    pdf.save(`modelo-carta-pedido-demissao-${safeName}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPreview(false); }}>
      <DialogTrigger asChild>
        <Button className="fixed bottom-24 right-6 z-[65] shadow-xl no-print" size="lg">
          <FileText className="mr-2 h-4 w-4" /> Modelo Carta de Demissão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Modelo de Carta de Pedido de Demissão</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Modelo para o funcionário copiar à mão. Não é assinatura digital e não substitui a carta escrita de próprio punho.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
              <SelectContent>{companies.filter((item) => item.status !== 'inativa').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Funcionário</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={!companyId}>
              <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
              <SelectContent>{funcionariosEmpresa.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Aviso prévio</Label>
            <Select value={aviso} onValueChange={(value) => setAviso(value as Aviso)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cumprir">Vai cumprir o aviso prévio</SelectItem>
                <SelectItem value="nao_cumprir">Não vai cumprir o aviso prévio</SelectItem>
                <SelectItem value="solicitar_dispensa">Solicita dispensa do aviso prévio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo do pedido (opcional)</Label>
            <Select value={motivo} onValueChange={(value) => setMotivo(value as Motivo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informar">Não informar</SelectItem>
                <SelectItem value="pessoais">Motivos pessoais</SelectItem>
                <SelectItem value="nova_oportunidade">Nova oportunidade profissional</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {motivo === 'outro' && <div className="md:col-span-2"><Label>Outro motivo</Label><Input value={motivoOutro} onChange={(event) => setMotivoOutro(event.target.value)} placeholder="Digite o motivo" /></div>}
        </div>
        {companyId && <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {loadingEmpresa ? 'Carregando dados da empresa...' : <><strong>{empresaNome || 'Empresa'}</strong> · CNPJ {empresa?.cnpj || 'não informado'}{endereco ? ` · ${endereco}` : ''}</>}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { if (validar()) setPreview((value) => !value); }}><Eye className="mr-2 h-4 w-4" />Visualizar modelo</Button>
          <Button onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
          <Button variant="secondary" onClick={baixarPdf}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button>
        </div>
        {preview && validar() && <div className="rounded-xl bg-slate-200 p-3 md:p-6"><div className="mx-auto min-h-[900px] max-w-[680px] bg-white px-14 py-12 text-[14px] leading-6 text-black shadow-xl">
          <p className="mb-8 text-center text-[11px] text-slate-500">MODELO PARA SER COPIADO DE PRÓPRIO PUNHO PELO FUNCIONÁRIO</p>
          <h2 className="mb-10 text-center text-lg font-bold">CARTA DE PEDIDO DE DEMISSÃO</h2>
          <div className="mb-8"><p>À</p><p className="font-bold">{empresaNome}</p><p>CNPJ: {empresa?.cnpj}</p>{endereco && <p>{endereco}</p>}</div>
          <div className="space-y-5 text-justify">
            <p>Eu, <strong>{funcionario?.name}</strong>, inscrito(a) no CPF nº <strong>{funcionario?.cpf}</strong>, ocupante do cargo de <strong>{funcionario?.cargo}</strong>, venho por meio desta solicitar o meu desligamento do quadro de funcionários desta empresa, por livre e espontânea vontade.</p>
            {motivoFinal && <p><strong>Motivo:</strong> {motivoFinal}</p>}
            <p>{avisoTexto[aviso]}</p>
            <p>Declaro estar ciente de que, por se tratar de pedido de demissão, não farei jus aos direitos específicos da dispensa sem justa causa, como multa de 40% sobre o FGTS, saque rescisório do FGTS e seguro-desemprego, permanecendo preservados os demais direitos rescisórios legalmente aplicáveis.</p>
            <p>Agradeço pela oportunidade e pela confiança depositada em meu trabalho.</p>
            <p>Solicito que sejam tomadas as providências necessárias para a formalização do meu desligamento.</p>
          </div>
          <p className="mt-10">{cidade}, ____ de __________________ de ______.</p>
          <div className="mx-auto mt-20 w-80 border-t border-black pt-2 text-center font-semibold">{funcionario?.name}</div>
        </div></div>}
      </DialogContent>
    </Dialog>
  );
};

export default PedidoDemissaoModelDialog;
