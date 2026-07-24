import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2, Plus, Printer, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeCombobox from '@/components/EmployeeCombobox';
import type { Employee } from '@/types/database';

interface RetiradaItem {
  nome: string;
  quantidade: number;
  observacao?: string;
}

interface RetiradaRow {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  cpf: string;
  matricula: string;
  funcao: string;
  setor: string;
  empresa_nome: string;
  filial: string;
  data_carga: string;
  itens_json: RetiradaItem[];
  observacao: string;
  status: string;
  responsavel_nome: string;
  created_at: string;
}

const normalizar = (valor: string) =>
  valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const escaparHtml = (valor: string) => valor
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const gerarTermoHTML = (registro: Partial<RetiradaRow>) => {
  const itens = registro.itens_json || [];
  const data = registro.data_carga
    ? new Date(`${registro.data_carga}T12:00:00`).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');
  const hora = registro.created_at
    ? new Date(registro.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Termo de Retirada - ${escaparHtml(registro.funcionario_nome || '')}</title>
<style>
@page { size: A4; margin: 16mm; }
body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
.header { text-align: center; margin-bottom: 18px; }
.header h1 { font-size: 17px; margin: 0 0 5px; }
.header p { margin: 0; color: #555; font-size: 11px; }
.box { border: 1px solid #777; border-radius: 6px; padding: 11px; margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { border: 1px solid #aaa; padding: 7px; text-align: left; }
th { background: #f1f1f1; }
.declaracao { margin: 18px 0; text-align: justify; line-height: 1.5; }
.assinaturas { display: flex; gap: 50px; margin-top: 60px; }
.assinatura { flex: 1; text-align: center; border-top: 1px solid #222; padding-top: 5px; }
</style>
</head>
<body>
<div class="header">
  <h1>TERMO DE RETIRADA DE MATERIAIS</h1>
  <p>Documento de controle interno do almoxarifado</p>
</div>
<div class="box">
  <div class="grid">
    <div><strong>Funcionário:</strong> ${escaparHtml(registro.funcionario_nome || '—')}</div>
    <div><strong>CPF:</strong> ${escaparHtml(registro.cpf || '—')}</div>
    <div><strong>Matrícula:</strong> ${escaparHtml(registro.matricula || '—')}</div>
    <div><strong>Função:</strong> ${escaparHtml(registro.funcao || '—')}</div>
    <div><strong>Empresa:</strong> ${escaparHtml(registro.empresa_nome || '—')}</div>
    <div><strong>Filial:</strong> ${escaparHtml(registro.filial || '—')}</div>
    <div><strong>Setor:</strong> ${escaparHtml(registro.setor || '—')}</div>
    <div><strong>Data/Hora:</strong> ${data} às ${hora}</div>
  </div>
</div>
<table>
<thead><tr><th style="width:8%">#</th><th>Material retirado</th><th style="width:15%">Quantidade</th><th>Observação</th></tr></thead>
<tbody>
${itens.map((item, index) => `<tr><td>${index + 1}</td><td>${escaparHtml(item.nome)}</td><td>${item.quantidade}</td><td>${escaparHtml(item.observacao || '')}</td></tr>`).join('')}
</tbody>
</table>
${registro.observacao ? `<div class="box" style="margin-top:12px"><strong>Observação:</strong><br>${escaparHtml(registro.observacao)}</div>` : ''}
<p class="declaracao">Declaro que recebi os materiais descritos acima, nas quantidades informadas, ficando responsável por sua guarda, conservação e utilização adequada nas atividades da empresa.</p>
<div class="assinaturas">
  <div class="assinatura">Assinatura do funcionário</div>
  <div class="assinatura">Responsável pela entrega</div>
</div>
</body>
</html>`;
};

const AlmoxarifadoCargaTab: React.FC = () => {
  const { session, employees, companies } = useApp();
  const userId = session?.user?.id;

  const [funcionarioId, setFuncionarioId] = useState('');
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [filial, setFilial] = useState('');
  const [setor, setSetor] = useState('');
  const [dataCarga, setDataCarga] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<RetiradaItem[]>([{ nome: '', quantidade: 1, observacao: '' }]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<RetiradaRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');

  const empresas = useMemo(() => Array.from(new Set(companies.map(c => c.name))).sort(), [companies]);

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

    const empresa = companies.find(c => c.id === employee.companyId);
    setFuncionarioId(employee.id);
    setFuncionarioNome(employee.name);
    setCpf(employee.cpf || '');
    setMatricula(employee.matriculaEsocial || employee.registro || '');
    setFuncao(employee.cargo || '');
    setEmpresaNome(empresa?.name || '');
  };

  const carregarHistorico = async () => {
    setCarregando(true);
    const { data, error } = await (supabase.from('almoxarifado_carga') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    setCarregando(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setHistorico((data || []) as RetiradaRow[]);
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  const imprimir = (registro: Partial<RetiradaRow>) => {
    const janela = window.open('', '_blank', 'width=900,height=700');
    if (!janela) {
      toast.error('Permita pop-ups para imprimir o termo.');
      return;
    }

    janela.document.write(gerarTermoHTML(registro));
    janela.document.close();
    setTimeout(() => {
      janela.focus();
      janela.print();
    }, 250);
  };

  const limpar = () => {
    setFuncionarioId('');
    setFuncionarioNome('');
    setCpf('');
    setMatricula('');
    setFuncao('');
    setEmpresaNome('');
    setFilial('');
    setSetor('');
    setItens([{ nome: '', quantidade: 1, observacao: '' }]);
    setObservacao('');
    setDataCarga(new Date().toISOString().slice(0, 10));
  };

  const salvar = async (imprimirDepois: boolean) => {
    if (!userId) {
      toast.error('Sessão expirada.');
      return;
    }

    if (!funcionarioNome.trim()) {
      toast.error('Selecione o funcionário.');
      return;
    }

    const itensValidos = itens.filter(item => item.nome.trim() && item.quantidade > 0);
    if (itensValidos.length === 0) {
      toast.error('Informe pelo menos um material.');
      return;
    }

    setSalvando(true);
    try {
      const responsavel = session?.user?.email || 'Sistema';
      const employee = employees.find(e => e.id === funcionarioId);
      const payload = {
        user_id: userId,
        usuario_nome: responsavel,
        funcionario_id: funcionarioId || null,
        funcionario_nome: funcionarioNome,
        cpf,
        matricula,
        funcao,
        setor,
        filial,
        empresa_nome: empresaNome,
        company_id: employee?.companyId || null,
        veiculo: '',
        data_carga: dataCarga,
        email_bruto: '',
        itens_json: itensValidos,
        observacao,
        status: 'pendente',
        tipo: 'retirada',
        responsavel_nome: responsavel,
        anexo_url: '',
        anexo_nome: '',
      };

      const { data, error } = await (supabase.from('almoxarifado_carga') as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      if (funcionarioId) {
        await supabase.from('documentos_funcionario').insert({
          funcionario_id: funcionarioId,
          funcionario_nome: funcionarioNome,
          company_id: employee?.companyId || null,
          empresa_nome: empresaNome,
          tipo_documento: 'Termo de Retirada de Materiais',
          competencia: dataCarga.slice(0, 7),
          descricao: `${itensValidos.length} item(ns) — ${itensValidos.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}`,
          arquivo_url: '',
          gerado_por_user_id: userId,
          gerado_por_nome: responsavel,
          status_envio: 'arquivado',
          unidade: empresaNome,
        } as any);
      }

      toast.success('Documento criado com sucesso.');
      if (imprimirDepois) imprimir(data as RetiradaRow);
      limpar();
      await carregarHistorico();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Erro ao criar documento.');
    } finally {
      setSalvando(false);
    }
  };

  const filtrados = historico.filter(registro => {
    const q = normalizar(busca);
    if (!q) return true;
    const materiais = (registro.itens_json || []).map(i => i.nome).join(' ');
    return normalizar(`${registro.funcionario_nome} ${registro.empresa_nome} ${materiais}`).includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="card-premium p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Criar termo de retirada de materiais
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Preencha os dados e gere o documento. Este módulo não consulta, valida ou desconta estoque.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
            <Search className="w-3 h-3" /> Funcionário *
          </label>
          <EmployeeCombobox value={funcionarioId} onChange={aplicarFuncionario} placeholder="Buscar por nome, CPF ou matrícula..." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">CPF</label><Input value={cpf} onChange={e => setCpf(e.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Matrícula</label><Input value={matricula} onChange={e => setMatricula(e.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Função</label><Input value={funcao} onChange={e => setFuncao(e.target.value)} /></div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Empresa</label>
            <select value={empresaNome} onChange={e => setEmpresaNome(e.target.value)} className="w-full h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">Selecione</option>
              {empresas.map(empresa => <option key={empresa} value={empresa}>{empresa}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Filial</label><Input value={filial} onChange={e => setFilial(e.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Setor</label><Input value={setor} onChange={e => setSetor(e.target.value)} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Data</label><Input type="date" value={dataCarga} onChange={e => setDataCarga(e.target.value)} /></div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Materiais do documento</h3>
            <Button size="sm" variant="outline" onClick={() => setItens([...itens, { nome: '', quantidade: 1, observacao: '' }])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar material
            </Button>
          </div>

          {itens.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" value={item.nome} onChange={e => {
                const copia = [...itens];
                copia[index] = { ...copia[index], nome: e.target.value };
                setItens(copia);
              }} placeholder="Descrição do material" />
              <Input className="col-span-2" type="number" min="1" value={item.quantidade} onChange={e => {
                const copia = [...itens];
                copia[index] = { ...copia[index], quantidade: Number(e.target.value) };
                setItens(copia);
              }} />
              <Input className="col-span-3" value={item.observacao || ''} onChange={e => {
                const copia = [...itens];
                copia[index] = { ...copia[index], observacao: e.target.value };
                setItens(copia);
              }} placeholder="Observação" />
              <Button className="col-span-1" variant="ghost" size="icon" onClick={() => {
                const restantes = itens.filter((_, i) => i !== index);
                setItens(restantes.length ? restantes : [{ nome: '', quantidade: 1, observacao: '' }]);
              }}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <label className="text-[10px] uppercase text-muted-foreground">Observação geral</label>
          <Textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => salvar(false)} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Criar documento
          </Button>
          <Button onClick={() => salvar(true)} disabled={salvando} variant="secondary">
            <Printer className="w-4 h-4 mr-2" /> Criar e imprimir
          </Button>
          <Button onClick={limpar} variant="ghost">Limpar</Button>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Histórico de documentos</h2>
          <Button size="sm" variant="outline" onClick={carregarHistorico} disabled={carregando}>
            <RefreshCw className={`w-4 h-4 mr-2 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        <Input placeholder="Buscar por funcionário, empresa ou material..." value={busca} onChange={e => setBusca(e.target.value)} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Funcionário</th>
                <th className="text-left p-2">Empresa</th>
                <th className="text-left p-2">Materiais</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(registro => (
                <tr key={registro.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{new Date(`${registro.data_carga}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td className="p-2">{registro.funcionario_nome}</td>
                  <td className="p-2">{registro.empresa_nome || '—'}</td>
                  <td className="p-2">{(registro.itens_json || []).map(i => `${i.quantidade}x ${i.nome}`).join(', ')}</td>
                  <td className="p-2"><Badge variant="secondary">{registro.status || 'pendente'}</Badge></td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" onClick={() => imprimir(registro)}>
                      <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                    </Button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum documento encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoCargaTab;
