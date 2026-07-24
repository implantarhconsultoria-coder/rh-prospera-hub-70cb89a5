import React, { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2, Plus, Printer, Search, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeCombobox from '@/components/EmployeeCombobox';
import type { Employee } from '@/types/database';
import { registrarDocumento } from '@/lib/documentoHistorico';
import { printDocumentInPage } from '@/lib/printInPage';

interface RetiradaItem {
  nome: string;
  quantidade: number;
  observacao?: string;
}

const normalizar = (valor: string) =>
  String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const escaparHtml = (valor: string) => String(valor || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const localizarFuncionario = (texto: string, employees: Employee[]) => {
  const textoNormalizado = normalizar(texto);
  const ativos = employees.filter(employee => employee.status === 'ativo');

  const nomeCompleto = ativos.find(employee => textoNormalizado.includes(normalizar(employee.name)));
  if (nomeCompleto) return nomeCompleto;

  const candidatos = ativos.filter(employee => {
    const nomes = normalizar(employee.name).split(/\s+/).filter(parte => parte.length >= 4);
    return nomes.some(parte => new RegExp(`\\b${parte}\\b`, 'i').test(textoNormalizado));
  });

  return candidatos.length === 1 ? candidatos[0] : null;
};

const extrairItensLocalmente = (texto: string): RetiradaItem[] => {
  const linhas = texto.split(/\r?\n/).map(linha => linha.trim()).filter(Boolean);
  const itens: RetiradaItem[] = [];

  const adicionar = (quantidade: number, nome: string) => {
    const item = nome
      .replace(/\b(?:para|pro|pra)\s+(?:o|a)?\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\s-]*$/i, '')
      .replace(/[.,;:]+$/g, '')
      .trim();
    if (item && quantidade > 0) itens.push({ nome: item, quantidade, observacao: '' });
  };

  for (const linha of linhas) {
    const padroes = [
      /(?:carga|retirada|entrega|separar|emitir)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s+(?:unidades?\s+de\s+|un\s+|und\s+|peças?\s+de\s+)?([^,.\n]+)/i,
      /(?:preciso|solicito|favor|gentileza)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s+(?:unidades?\s+de\s+|un\s+|und\s+|peças?\s+de\s+)?([^,.\n]+)/i,
      /^[-•*]?\s*(\d+(?:[.,]\d+)?)\s*(?:x|un|und|unidade|unidades|pç|peça|peças)?\s*[-:–—]?\s*(.+)$/i,
      /\b(\d+(?:[.,]\d+)?)\s+(?:unidades?\s+de\s+|un\s+|und\s+|peças?\s+de\s+)?([A-Za-zÀ-ÿ][^,.\n]*)/i,
    ];

    for (const padrao of padroes) {
      const match = linha.match(padrao);
      if (match) {
        adicionar(Number(match[1].replace(',', '.')), match[2]);
        break;
      }
    }
  }

  return itens;
};

const AlmoxarifadoCargaTab: React.FC = () => {
  const { session, employees, companies } = useApp();
  const userId = session?.user?.id;

  const [textoColado, setTextoColado] = useState('');
  const [processando, setProcessando] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState('');
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [filial, setFilial] = useState('');
  const [setor, setSetor] = useState('');
  const [dataRetirada, setDataRetirada] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<RetiradaItem[]>([{ nome: '', quantidade: 1, observacao: '' }]);
  const [observacao, setObservacao] = useState('');
  const [gerando, setGerando] = useState(false);

  const empresa = useMemo(
    () => companies.find(company => company.name === empresaNome),
    [companies, empresaNome],
  );

  const aplicarFuncionario = (employee: Employee | null) => {
    if (!employee) {
      setFuncionarioId('');
      setFuncionarioNome('');
      setCpf('');
      setMatricula('');
      setFuncao('');
      setEmpresaNome('');
      return;
    }

    const company = companies.find(item => item.id === employee.companyId);
    setFuncionarioId(employee.id);
    setFuncionarioNome(employee.name);
    setCpf(employee.cpf || '');
    setMatricula(employee.matriculaEsocial || employee.registro || '');
    setFuncao(employee.cargo || '');
    setEmpresaNome(company?.name || '');
    setFilial(company?.city || '');
    setSetor(employee.categoria === 'operacional' ? 'Operacional' : employee.categoria || '');
  };

  const lerEPreencher = async () => {
    if (!textoColado.trim()) {
      toast.error('Cole a solicitação antes de ler.');
      return;
    }

    setProcessando(true);
    try {
      const funcionarioLocal = localizarFuncionario(textoColado, employees);
      let itensExtraidos = extrairItensLocalmente(textoColado);
      let nomeFuncionarioIA = '';

      try {
        const { data, error } = await supabase.functions.invoke('parse-text', {
          body: { text: textoColado, type: 'almoxarifado' },
        });
        if (error) throw error;
        const resultado = data?.data || {};
        nomeFuncionarioIA = resultado.funcionario_nome || resultado.funcionario || resultado.nome || '';
        const itensIA = Array.isArray(resultado.itens) ? resultado.itens : [];
        if (itensIA.length) {
          itensExtraidos = itensIA.map((item: any) => ({
            nome: String(item.nome || item.item || item.descricao || '').trim(),
            quantidade: Number(item.quantidade || item.qtd || 1),
            observacao: String(item.observacao || ''),
          })).filter((item: RetiradaItem) => item.nome && item.quantidade > 0);
        }
      } catch (error) {
        console.warn('[almoxarifado] leitura IA indisponível; usando leitura local', error);
      }

      let funcionario = funcionarioLocal;
      if (!funcionario && nomeFuncionarioIA) {
        const alvo = normalizar(nomeFuncionarioIA);
        funcionario = employees.find(employee => normalizar(employee.name).includes(alvo) || alvo.includes(normalizar(employee.name))) || null;
      }

      if (funcionario) aplicarFuncionario(funcionario);
      if (itensExtraidos.length) setItens(itensExtraidos);
      setObservacao(textoColado);

      if (!funcionario && itensExtraidos.length === 0) {
        toast.warning('O texto foi copiado para observação. Selecione o funcionário e informe os materiais manualmente.');
      } else if (!funcionario) {
        toast.warning('Materiais preenchidos. Selecione o funcionário para gerar o documento.');
      } else if (itensExtraidos.length === 0) {
        toast.warning('Funcionário preenchido. Informe os materiais para gerar o documento.');
      } else {
        toast.success('Solicitação lida e formulário preenchido. Revise antes de gerar.');
      }
    } finally {
      setProcessando(false);
    }
  };

  const atualizarItem = (index: number, dados: Partial<RetiradaItem>) => {
    setItens(current => current.map((item, i) => i === index ? { ...item, ...dados } : item));
  };

  const montarDocumento = (itensValidos: RetiradaItem[]) => {
    const dataFormatada = new Date(`${dataRetirada}T12:00:00`).toLocaleDateString('pt-BR');
    const emissao = new Date().toLocaleString('pt-BR');
    const cnpj = empresa?.cnpj || '';

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de Retirada de Materiais</title>
<style>
@page{size:A4;margin:12mm}body{margin:0;background:#fff;color:#000;font-family:'Segoe UI',Arial,sans-serif;font-size:11px}.pagina{max-width:210mm;margin:0 auto;padding:6mm}.cabecalho{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}.titulo{text-align:right;font-size:15px;font-weight:700}.sub{font-size:10px;color:#555}.box{border:1px solid #999;border-radius:5px;padding:10px;margin-bottom:14px}.legenda{font-size:9px;text-transform:uppercase;color:#666;font-weight:700;margin-bottom:7px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px 14px}.rotulo{color:#666}.valor{font-weight:600}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:1px solid #aaa;padding:7px}th{background:#e9e9e9;text-align:left}.centro{text-align:center}.termo{border:1px solid #999;border-radius:5px;padding:11px;line-height:1.5;text-align:justify}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:70px}.assinatura{text-align:center;border-top:1px solid #000;padding-top:5px}.nome{font-weight:700}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pagina{padding:0}}
</style></head><body><div class="pagina">
<div class="cabecalho"><div><div style="font-size:17px;font-weight:700">${escaparHtml(empresaNome || 'TOPAC')}</div><div class="sub">CNPJ: ${escaparHtml(cnpj)}</div></div><div class="titulo">TERMO DE RETIRADA DE MATERIAIS<div class="sub">Data: ${dataFormatada}<br>Emissão: ${emissao}</div></div></div>
<div class="box"><div class="legenda">Dados do colaborador</div><div class="grid">
<div><span class="rotulo">Nome:</span> <span class="valor">${escaparHtml(funcionarioNome)}</span></div>
<div><span class="rotulo">Função:</span> ${escaparHtml(funcao || '—')}</div>
<div><span class="rotulo">CPF:</span> ${escaparHtml(cpf || '—')}</div>
<div><span class="rotulo">Matrícula:</span> ${escaparHtml(matricula || '—')}</div>
<div><span class="rotulo">Setor:</span> ${escaparHtml(setor || '—')}</div>
<div><span class="rotulo">Empresa:</span> ${escaparHtml(empresaNome || '—')}</div>
<div><span class="rotulo">Unidade:</span> ${escaparHtml(filial || empresa?.city || '—')}</div>
<div><span class="rotulo">Data da retirada:</span> ${dataFormatada}</div>
</div></div>
<table><thead><tr><th>Item / Descrição</th><th style="width:14%" class="centro">Quantidade</th><th style="width:30%">Observação</th></tr></thead><tbody>
${itensValidos.map(item => `<tr><td>${escaparHtml(item.nome)}</td><td class="centro">${item.quantidade}</td><td>${escaparHtml(item.observacao || '—')}</td></tr>`).join('')}
</tbody></table>
${observacao ? `<div class="box"><div class="legenda">Solicitação / observação</div><div style="white-space:pre-wrap">${escaparHtml(observacao)}</div></div>` : ''}
<div class="termo"><div class="legenda">Termo de responsabilidade</div>Declaro que recebi os materiais descritos acima, nas quantidades informadas, ficando responsável por sua guarda, conservação e utilização adequada nas atividades da empresa.</div>
<div class="assinaturas"><div class="assinatura"><div class="nome">${escaparHtml(funcionarioNome)}</div><div class="sub">Colaborador</div></div><div class="assinatura"><div class="nome">&nbsp;</div><div class="sub">Responsável pela entrega</div></div></div>
</div></body></html>`;
  };

  const gerarDocumento = async () => {
    if (!userId) {
      toast.error('Sessão expirada.');
      return;
    }
    if (!funcionarioId || !funcionarioNome) {
      toast.error('Selecione o funcionário.');
      return;
    }

    const itensValidos = itens.filter(item => item.nome.trim() && item.quantidade > 0);
    if (!itensValidos.length) {
      toast.error('Informe pelo menos um material.');
      return;
    }

    const employee = employees.find(item => item.id === funcionarioId);
    const company = companies.find(item => item.id === employee?.companyId);
    if (!employee || !company) {
      toast.error('Dados do funcionário ou da empresa não encontrados.');
      return;
    }

    setGerando(true);
    const html = montarDocumento(itensValidos);
    const resumo = itensValidos.map(item => `${item.quantidade}x ${item.nome}`).join(', ');

    try {
      await registrarDocumento({
        funcionarioId: employee.id,
        funcionarioNome: employee.name,
        companyId: company.id,
        empresaNome: company.name,
        tipoDocumento: 'Termo de Retirada de Materiais',
        competencia: dataRetirada.slice(0, 7),
        descricao: `Retirada de materiais: ${resumo}`,
        geradoPorUserId: userId,
        geradoPorNome: session?.user?.user_metadata?.nome_completo || session?.user?.email || 'Sistema',
        unidade: company.city,
        categoria: 'TERMOS',
        origem: 'gerado_sistema',
        observacao: observacao || textoColado,
        dataDocumento: dataRetirada,
      });
    } catch (error) {
      console.warn('[almoxarifado] documento impresso, mas histórico não foi salvo', error);
      toast.warning('Documento será aberto para impressão, mas o histórico não pôde ser salvo.');
    }

    printDocumentInPage(html);
    toast.success('Documento gerado. Use a janela de impressão para imprimir ou salvar em PDF.');
    setGerando(false);
  };

  const limpar = () => {
    setTextoColado('');
    setFuncionarioId('');
    setFuncionarioNome('');
    setCpf('');
    setMatricula('');
    setFuncao('');
    setEmpresaNome('');
    setFilial('');
    setSetor('');
    setDataRetirada(new Date().toISOString().slice(0, 10));
    setItens([{ nome: '', quantidade: 1, observacao: '' }]);
    setObservacao('');
  };

  return (
    <div className="space-y-5">
      <div className="card-premium p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Termo de retirada do almoxarifado</h2>
          <p className="text-xs text-muted-foreground mt-1">Cole a solicitação como no Protocolo, revise os campos preenchidos e gere uma ficha no modelo da Entrega de EPI. Não consulta nem desconta estoque.</p>
        </div>

        <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
          <label className="text-xs font-medium">Cole o e-mail ou WhatsApp</label>
          <Textarea value={textoColado} onChange={event => setTextoColado(event.target.value)} rows={4} placeholder="Ex.: Bom dia, por gentileza emitir a carga de 2 cadeados para o Gustavo" />
          <Button size="sm" onClick={lerEPreencher} disabled={processando}>
            {processando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Ler e preencher
          </Button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><Search className="w-3 h-3" /> Funcionário *</label>
          <EmployeeCombobox value={funcionarioId} onChange={aplicarFuncionario} placeholder="Buscar por nome, CPF ou matrícula..." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">CPF</label><Input value={cpf} onChange={event => setCpf(event.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Matrícula</label><Input value={matricula} onChange={event => setMatricula(event.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Função</label><Input value={funcao} onChange={event => setFuncao(event.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Empresa</label><Input value={empresaNome} readOnly /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Unidade / Filial</label><Input value={filial} onChange={event => setFilial(event.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Setor</label><Input value={setor} onChange={event => setSetor(event.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Data</label><Input type="date" value={dataRetirada} onChange={event => setDataRetirada(event.target.value)} /></div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center"><h3 className="text-sm font-semibold">Materiais</h3><Button size="sm" variant="outline" onClick={() => setItens(current => [...current, { nome: '', quantidade: 1, observacao: '' }])}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar material</Button></div>
          {itens.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" value={item.nome} onChange={event => atualizarItem(index, { nome: event.target.value })} placeholder="Descrição do material" />
              <Input className="col-span-2" type="number" min="1" value={item.quantidade} onChange={event => atualizarItem(index, { quantidade: Number(event.target.value) })} />
              <Input className="col-span-3" value={item.observacao || ''} onChange={event => atualizarItem(index, { observacao: event.target.value })} placeholder="Observação" />
              <Button className="col-span-1" variant="ghost" size="icon" onClick={() => setItens(current => current.length === 1 ? [{ nome: '', quantidade: 1, observacao: '' }] : current.filter((_, i) => i !== index))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
        </div>

        <div><label className="text-[10px] uppercase text-muted-foreground">Solicitação / observação</label><Textarea rows={3} value={observacao} onChange={event => setObservacao(event.target.value)} /></div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={gerarDocumento} disabled={gerando} className="gradient-accent text-accent-foreground font-semibold">
            {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />} Gerar documento
          </Button>
          <Button variant="ghost" onClick={limpar}>Limpar</Button>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoCargaTab;
