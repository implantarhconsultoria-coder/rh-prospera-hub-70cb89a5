/**
 * AlmoxarifadoCargaTab — aba "Carga"
 *
 * Registra materiais/equipamentos enviados para o carro de um funcionário.
 *
 * IMPORTANTE: NÃO mexe no estoque do almoxarifado.
 * É apenas registro/conferência (até alinhamento futuro).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Truck, Plus, Trash2, Wand2, Loader2, Save, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface CargaItem { nome: string; quantidade: number; observacao?: string }
interface CargaRow {
  id: string;
  funcionario_nome: string;
  empresa_nome: string;
  veiculo: string;
  data_carga: string;
  itens_json: CargaItem[];
  observacao: string;
  status: 'pendente' | 'conferido' | 'enviado' | 'finalizado';
  created_at: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'conferido': return <Badge className="bg-primary text-primary-foreground">Conferido</Badge>;
    case 'enviado': return <Badge className="bg-success text-success-foreground">Enviado</Badge>;
    case 'finalizado': return <Badge variant="outline">Finalizado</Badge>;
    default: return <Badge variant="secondary">Pendente</Badge>;
  }
};

/**
 * Parser simples de e-mail. Procura padrões "qtd x item" / "qtd item" /
 * "- item ... qtd". Mantemos heurístico: se nada encontrar, lista vazia.
 */
const parseEmailItens = (texto: string): CargaItem[] => {
  if (!texto.trim()) return [];
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itens: CargaItem[] = [];
  const reA = /^(\d+(?:[.,]\d+)?)\s*(?:x|un|und|unidade|pç|peças?)\s*[-:]?\s*(.+)$/i;
  const reB = /^[-•*]\s*(.+?)\s*[-—–]\s*(\d+(?:[.,]\d+)?)\s*(?:un|und|unidade|pç|x)?\s*$/i;
  const reC = /^(.+?)\s*[-—–:]\s*(\d+(?:[.,]\d+)?)\s*(?:un|und|unidade|pç|x)?\s*$/i;
  const reD = /^(\d+(?:[.,]\d+)?)\s+(.+)$/;
  for (const linha of linhas) {
    let m: RegExpMatchArray | null = null;
    if ((m = linha.match(reA))) itens.push({ nome: m[2].trim(), quantidade: Number(m[1].replace(',', '.')) });
    else if ((m = linha.match(reB))) itens.push({ nome: m[1].trim(), quantidade: Number(m[2].replace(',', '.')) });
    else if ((m = linha.match(reC))) itens.push({ nome: m[1].trim(), quantidade: Number(m[2].replace(',', '.')) });
    else if ((m = linha.match(reD)) && Number(m[1]) <= 999) itens.push({ nome: m[2].trim(), quantidade: Number(m[1].replace(',', '.')) });
  }
  return itens;
};

const parseFuncionarioFromEmail = (texto: string, employees: { id: string; name: string }[]): { id?: string; nome: string } => {
  const lc = texto.toLowerCase();
  for (const e of employees) {
    const tokens = e.name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length && tokens.every((t) => lc.includes(t))) return { id: e.id, nome: e.name };
  }
  // tenta linha "Para:" "Solicitante:"
  const m = texto.match(/(?:para|solicitante|funcionario|colaborador)\s*[:\-]\s*([^\n]+)/i);
  return { nome: m ? m[1].trim() : '' };
};

const AlmoxarifadoCargaTab: React.FC = () => {
  const { session, employees, companies } = useApp();
  const userId = session?.user?.id;

  const [emailBruto, setEmailBruto] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [dataCarga, setDataCarga] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<CargaItem[]>([]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [cargas, setCargas] = useState<CargaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCargas = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from('almoxarifado_carga') as unknown as { select: (s: string) => { order: (k: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: CargaRow[] | null; error: { message: string } | null }> } } })
      .select('*').order('created_at', { ascending: false }).limit(200);
    setLoading(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCargas(data || []);
  };

  useEffect(() => { fetchCargas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const preencherAuto = () => {
    if (!emailBruto.trim()) { toast.error('Cole o e-mail antes.'); return; }
    const f = parseFuncionarioFromEmail(emailBruto, employees);
    if (f.id) setFuncionarioId(f.id);
    if (f.nome) setFuncionarioNome(f.nome);
    if (f.id) {
      const emp = employees.find((e) => e.id === f.id);
      const co = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
      if (co) setEmpresaNome(co.name);
    }
    const its = parseEmailItens(emailBruto);
    if (its.length) setItens(its);
    toast.success(`${its.length} item(ns) detectado(s).`);
  };

  const limparForm = () => {
    setEmailBruto(''); setFuncionarioId(''); setFuncionarioNome(''); setEmpresaNome('');
    setVeiculo(''); setItens([]); setObservacao('');
    setDataCarga(new Date().toISOString().slice(0, 10));
  };

  const salvar = async () => {
    if (!userId) { toast.error('Sessão expirada'); return; }
    if (!funcionarioNome.trim()) { toast.error('Informe o funcionário.'); return; }
    if (itens.length === 0) { toast.error('Adicione pelo menos um item.'); return; }
    setSalvando(true);
    try {
      const emp = funcionarioId ? employees.find((e) => e.id === funcionarioId) : undefined;
      const co = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
      const { error } = await (supabase.from('almoxarifado_carga') as unknown as { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }).insert({
        user_id: userId,
        usuario_nome: session?.user?.email || '',
        funcionario_id: funcionarioId || null,
        funcionario_nome: funcionarioNome,
        empresa_nome: empresaNome || co?.name || '',
        company_id: emp?.companyId || null,
        veiculo,
        data_carga: dataCarga,
        email_bruto: emailBruto,
        itens_json: itens,
        observacao,
        status: 'pendente',
      });
      if (error) throw new Error(error.message);
      toast.success('Carga registrada com sucesso.');
      limparForm();
      await fetchCargas();
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatus = async (id: string, status: CargaRow['status']) => {
    const { error } = await (supabase.from('almoxarifado_carga') as unknown as { update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } })
      .update({ status }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Status atualizado.');
    await fetchCargas();
  };

  const empresasUnicas = useMemo(() => companies.map((c) => c.name), [companies]);

  return (
    <div className="space-y-5">
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> Nova Carga
          </h2>
          <p className="text-xs text-muted-foreground">⚠ Esta aba <strong>não desconta do estoque</strong>. Apenas registra/confere.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">E-mail de solicitação (cole aqui)</label>
          <Textarea
            value={emailBruto}
            onChange={(e) => setEmailBruto(e.target.value)}
            placeholder={'Cole o texto completo do e-mail. Ex.:\n2x parafuso M8\n3 - mangueira 1/2\n10 luvas nitrílicas'}
            rows={5}
            className="text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={preencherAuto}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Preencher automaticamente
            </Button>
            <Button variant="ghost" size="sm" onClick={limparForm}>Limpar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Funcionário *</label>
            <select
              value={funcionarioId}
              onChange={(e) => {
                setFuncionarioId(e.target.value);
                const emp = employees.find((emp) => emp.id === e.target.value);
                if (emp) {
                  setFuncionarioNome(emp.name);
                  const co = companies.find((c) => c.id === emp.companyId);
                  if (co) setEmpresaNome(co.name);
                }
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground h-10"
            >
              <option value="">Selecione...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {funcionarioNome && !funcionarioId && (
              <p className="text-[10px] text-warning mt-1">Detectado: {funcionarioNome} (não vinculado)</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Empresa/Filial</label>
            <select
              value={empresaNome}
              onChange={(e) => setEmpresaNome(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground h-10"
            >
              <option value="">—</option>
              {empresasUnicas.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data da carga</label>
            <Input type="date" value={dataCarga} onChange={(e) => setDataCarga(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Veículo (placa / modelo)</label>
            <Input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Ex.: ABC-1234 / Strada" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">Itens identificados ({itens.length})</h3>
            <Button size="sm" variant="outline" onClick={() => setItens([...itens, { nome: '', quantidade: 1 }])}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar
            </Button>
          </div>
          {itens.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center border rounded-lg">
              Nenhum item adicionado. Cole o e-mail e clique em "Preencher automaticamente".
            </p>
          )}
          {itens.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-6"
                value={it.nome}
                onChange={(e) => {
                  const arr = [...itens]; arr[idx].nome = e.target.value; setItens(arr);
                }}
                placeholder="Nome do item"
              />
              <Input
                className="col-span-2"
                type="number"
                value={it.quantidade}
                onChange={(e) => {
                  const arr = [...itens]; arr[idx].quantidade = Number(e.target.value); setItens(arr);
                }}
                placeholder="Qtd"
              />
              <Input
                className="col-span-3"
                value={it.observacao || ''}
                onChange={(e) => {
                  const arr = [...itens]; arr[idx].observacao = e.target.value; setItens(arr);
                }}
                placeholder="Obs (opcional)"
              />
              <Button size="icon" variant="ghost" className="text-destructive col-span-1"
                onClick={() => setItens(itens.filter((_, i) => i !== idx))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Observação geral</label>
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
        </div>

        <div className="flex gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Carga
          </Button>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Cargas registradas</h2>
          <Button size="sm" variant="outline" onClick={fetchCargas} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Atualizar
          </Button>
        </div>

        <div className="overflow-x-auto sticky-x-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Data', 'Funcionário', 'Empresa', 'Veículo', 'Itens', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma carga registrada ainda.</p>
                </td></tr>
              )}
              {cargas.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{new Date(c.data_carga).toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2 text-xs font-medium">{c.funcionario_nome}</td>
                  <td className="px-3 py-2 text-xs">{c.empresa_nome || '—'}</td>
                  <td className="px-3 py-2 text-xs">{c.veiculo || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {(c.itens_json || []).slice(0, 3).map((i, k) => (
                      <span key={k} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-muted text-[10px]">
                        {i.quantidade}× {i.nome}
                      </span>
                    ))}
                    {(c.itens_json || []).length > 3 && <span className="text-[10px] text-muted-foreground">+{(c.itens_json || []).length - 3}</span>}
                  </td>
                  <td className="px-3 py-2">{statusBadge(c.status)}</td>
                  <td className="px-3 py-2 text-xs space-x-1">
                    {c.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'conferido')}>Conferir</Button>}
                    {c.status === 'conferido' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'enviado')}>Marcar Enviado</Button>}
                    {c.status === 'enviado' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'finalizado')}>Finalizar</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoCargaTab;
