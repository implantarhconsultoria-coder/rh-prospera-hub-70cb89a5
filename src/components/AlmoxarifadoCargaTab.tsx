/**
 * AlmoxarifadoCargaTab — aba "Carga" (corrigida)
 *
 * Regras (correção final):
 *  - NÃO exige veículo.
 *  - Carga = Funcionário + Empresa/Filial + Data + Itens.
 *  - Ao salvar, decrementa o estoque (almoxarifado_itens.quantidade) e
 *    cria registros em almoxarifado_saidas (1 por item) — assim o histórico mostra a retirada.
 *  - Avisa antes de salvar se algum item não tem estoque suficiente.
 *  - Registra no acoes_log para alimentar o Histórico geral.
 *  - Permite imprimir comprovante simples da carga.
 *  - Admin/Rodrigo pode excluir cargas (via lista existente).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Truck, Plus, Trash2, Wand2, Loader2, Save, RefreshCw, FileText, Printer, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface CargaItem {
  item_id?: string;        // id em almoxarifado_itens (preferido)
  nome: string;
  quantidade: number;
  observacao?: string;
}
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

interface EstoqueItem {
  id: string;
  nome: string;
  unidade: string;
  quantidade: number;
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'conferido': return <Badge className="bg-primary text-primary-foreground">Conferido</Badge>;
    case 'enviado': return <Badge className="bg-success text-success-foreground">Enviado</Badge>;
    case 'finalizado': return <Badge variant="outline">Finalizado</Badge>;
    default: return <Badge variant="secondary">Pendente</Badge>;
  }
};

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
  const m = texto.match(/(?:para|solicitante|funcionario|colaborador)\s*[:\-]\s*([^\n]+)/i);
  return { nome: m ? m[1].trim() : '' };
};

const AlmoxarifadoCargaTab: React.FC = () => {
  const { session, employees, companies, userRole } = useApp();
  const isAdmin = userRole === 'admin';
  const userId = session?.user?.id;

  const [emailBruto, setEmailBruto] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [dataCarga, setDataCarga] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<CargaItem[]>([]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [cargas, setCargas] = useState<CargaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);

  const fetchCargas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('almoxarifado_carga' as never)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCargas((data || []) as unknown as CargaRow[]);
  };

  const fetchEstoque = async () => {
    const { data } = await supabase
      .from('almoxarifado_itens')
      .select('id, nome, unidade, quantidade')
      .order('nome');
    setEstoque((data || []) as unknown as EstoqueItem[]);
  };

  useEffect(() => { fetchCargas(); fetchEstoque(); }, []);

  const empresasUnicas = useMemo(() => companies.map((c) => c.name), [companies]);

  const matchEstoqueByNome = (nome: string): EstoqueItem | undefined => {
    const lc = nome.trim().toLowerCase();
    return estoque.find(e => e.nome.toLowerCase() === lc) ||
      estoque.find(e => e.nome.toLowerCase().includes(lc) || lc.includes(e.nome.toLowerCase()));
  };

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
    const its = parseEmailItens(emailBruto).map(it => {
      const m = matchEstoqueByNome(it.nome);
      return m ? { ...it, item_id: m.id, nome: m.nome } : it;
    });
    if (its.length) setItens(its);
    toast.success(`${its.length} item(ns) detectado(s).`);
  };

  const limparForm = () => {
    setEmailBruto(''); setFuncionarioId(''); setFuncionarioNome(''); setEmpresaNome('');
    setItens([]); setObservacao('');
    setDataCarga(new Date().toISOString().slice(0, 10));
  };

  const adicionarLinhaVazia = () => {
    setItens([...itens, { nome: '', quantidade: 1 }]);
  };

  const validarEstoque = (): { ok: boolean; faltas: string[] } => {
    const faltas: string[] = [];
    for (const it of itens) {
      if (!it.item_id) continue; // item livre, não desconta
      const stock = estoque.find(e => e.id === it.item_id);
      if (!stock) { faltas.push(`${it.nome}: não está no estoque`); continue; }
      if ((stock.quantidade || 0) < it.quantidade) {
        faltas.push(`${stock.nome}: precisa ${it.quantidade}, disponível ${stock.quantidade}`);
      }
    }
    return { ok: faltas.length === 0, faltas };
  };

  const salvar = async () => {
    if (!userId) { toast.error('Sessão expirada'); return; }
    if (!funcionarioNome.trim()) { toast.error('Informe o funcionário.'); return; }
    if (itens.length === 0) { toast.error('Adicione pelo menos um item.'); return; }

    const check = validarEstoque();
    if (!check.ok) {
      const msg = 'Estoque insuficiente:\n' + check.faltas.join('\n') + '\n\nDeseja salvar a carga assim mesmo (sem descontar os itens em falta)?';
      if (!window.confirm(msg)) return;
    }

    setSalvando(true);
    try {
      const emp = funcionarioId ? employees.find((e) => e.id === funcionarioId) : undefined;
      const co = emp ? companies.find((c) => c.id === emp.companyId) : undefined;

      // 1) Cria a carga
      const { data: cargaData, error } = await (supabase
        .from('almoxarifado_carga' as never)
        .insert({
          user_id: userId,
          usuario_nome: session?.user?.email || '',
          funcionario_id: funcionarioId || null,
          funcionario_nome: funcionarioNome,
          empresa_nome: empresaNome || co?.name || '',
          company_id: emp?.companyId || null,
          veiculo: '',
          data_carga: dataCarga,
          email_bruto: emailBruto,
          itens_json: itens,
          observacao,
          status: 'pendente',
        } as never)
        .select()
        .single() as unknown as Promise<{ data: { id: string } | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);

      // 2) Para cada item com item_id, cria saída e decrementa estoque
      for (const it of itens) {
        if (!it.item_id) continue;
        const stock = estoque.find(e => e.id === it.item_id);
        if (!stock) continue;
        const desc = Math.min(stock.quantidade, it.quantidade); // só desconta o que tem
        if (desc <= 0) continue;

        await supabase.from('almoxarifado_saidas').insert({
          user_id: userId,
          item_id: it.item_id,
          quantidade: desc,
          funcionario_nome: funcionarioNome,
          motivo: 'Carga',
          observacao: `Carga de ${dataCarga}${it.observacao ? ' — ' + it.observacao : ''}`,
        } as never);

        await supabase.from('almoxarifado_itens').update({
          quantidade: Math.max(0, stock.quantidade - desc),
        } as never).eq('id', it.item_id);
      }

      // 3) Log no histórico geral
      await supabase.from('acoes_log').insert({
        modulo: 'almoxarifado',
        entidade: 'carga',
        entidade_id: cargaData?.id || null,
        acao: 'carga_registrada',
        funcionario_id: funcionarioId || null,
        funcionario_nome: funcionarioNome,
        empresa: empresaNome || co?.name || '',
        user_id: userId,
        user_email: session?.user?.email || '',
        observacao: `${itens.length} item(ns) — ${itens.map(i => `${i.quantidade}× ${i.nome}`).join('; ')}`,
      } as never);

      toast.success('Carga registrada e estoque atualizado.');
      limparForm();
      await Promise.all([fetchCargas(), fetchEstoque()]);
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatus = async (id: string, status: CargaRow['status']) => {
    const { error } = await (supabase
      .from('almoxarifado_carga' as never)
      .update({ status } as never)
      .eq('id', id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Status atualizado.');
    await fetchCargas();
  };

  const excluirCarga = async (c: CargaRow) => {
    if (!isAdmin) { toast.error('Apenas o Admin pode excluir cargas.'); return; }
    if (!window.confirm(`Excluir carga de ${c.funcionario_nome} (${c.data_carga})?`)) return;
    const { error } = await (supabase
      .from('almoxarifado_carga' as never)
      .delete()
      .eq('id', c.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Carga excluída.');
    fetchCargas();
  };

  const imprimirCarga = (c: CargaRow) => {
    const html = `<!DOCTYPE html><html><head><title>Carga ${c.funcionario_nome}</title>
      <style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
      h1{font-size:18px;margin:0 0 6px 0}h2{font-size:12px;color:#444;margin:0 0 12px 0}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{padding:6px 8px;border:1px solid #999;font-size:12px;text-align:left}
      th{background:#eee;text-transform:uppercase;font-size:10px}</style></head><body>
      <h1>Comprovante de Carga — Almoxarifado</h1>
      <h2>${c.empresa_nome || '—'} • ${new Date(c.data_carga).toLocaleDateString('pt-BR')}</h2>
      <p><strong>Funcionário:</strong> ${c.funcionario_nome}</p>
      ${c.observacao ? `<p><strong>Observação:</strong> ${c.observacao}</p>` : ''}
      <table><thead><tr><th>Item</th><th>Qtd</th><th>Observação</th></tr></thead>
      <tbody>${(c.itens_json || []).map(i => `<tr><td>${i.nome}</td><td>${i.quantidade}</td><td>${i.observacao || ''}</td></tr>`).join('')}</tbody></table>
      <p style="margin-top:50px;font-size:11px">Recebido por ____________________________________ em ____/____/______</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Bloqueador de pop-up impediu a impressão.'); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 250);
  };

  return (
    <div className="space-y-5">
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> Nova Carga
          </h2>
          <p className="text-xs text-muted-foreground">Itens vinculados ao estoque <strong>são descontados</strong> ao salvar.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">E-mail de solicitação (cole aqui — opcional)</label>
          <Textarea
            value={emailBruto}
            onChange={(e) => setEmailBruto(e.target.value)}
            placeholder={'Cole o texto completo do e-mail. Ex.:\n2x parafuso M8\n3 - mangueira 1/2\n10 luvas nitrílicas'}
            rows={4}
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
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Empresa/Filial *</label>
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
            <label className="text-xs text-muted-foreground block mb-1">Data da carga *</label>
            <Input type="date" value={dataCarga} onChange={(e) => setDataCarga(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">Itens ({itens.length})</h3>
            <Button size="sm" variant="outline" onClick={adicionarLinhaVazia}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar
            </Button>
          </div>
          {itens.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center border rounded-lg">
              Nenhum item. Adicione manualmente ou cole o e-mail e clique em "Preencher automaticamente".
            </p>
          )}
          {itens.map((it, idx) => {
            const stock = it.item_id ? estoque.find(e => e.id === it.item_id) : matchEstoqueByNome(it.nome);
            const semEstoque = stock && it.quantidade > stock.quantidade;
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  className="col-span-6 border rounded-lg px-2 py-2 text-sm bg-background text-foreground h-10"
                  value={it.item_id || ''}
                  onChange={(e) => {
                    const arr = [...itens];
                    const stk = estoque.find(s => s.id === e.target.value);
                    if (stk) { arr[idx].item_id = stk.id; arr[idx].nome = stk.nome; }
                    else { arr[idx].item_id = undefined; }
                    setItens(arr);
                  }}
                >
                  <option value="">{it.nome ? `${it.nome} (não vinculado)` : 'Selecione um item do estoque...'}</option>
                  {estoque.map(s => (
                    <option key={s.id} value={s.id}>{s.nome} — {s.quantidade} {s.unidade || 'un'} disp.</option>
                  ))}
                </select>
                <Input
                  className="col-span-2"
                  type="number"
                  min={1}
                  value={it.quantidade}
                  onChange={(e) => { const arr = [...itens]; arr[idx].quantidade = Number(e.target.value); setItens(arr); }}
                />
                <Input
                  className="col-span-3"
                  value={it.observacao || ''}
                  onChange={(e) => { const arr = [...itens]; arr[idx].observacao = e.target.value; setItens(arr); }}
                  placeholder="Obs (opcional)"
                />
                <Button size="icon" variant="ghost" className="text-destructive col-span-1"
                  onClick={() => setItens(itens.filter((_, i) => i !== idx))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                {semEstoque && (
                  <p className="col-span-12 text-[11px] text-destructive flex items-center gap-1 -mt-1">
                    <AlertTriangle className="w-3 h-3" /> Estoque insuficiente: {stock?.quantidade} disponível
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Observação geral</label>
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
        </div>

        <div className="flex gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Carga e Descontar Estoque
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
                {['Data', 'Funcionário', 'Empresa', 'Itens', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargas.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma carga registrada ainda.</p>
                </td></tr>
              )}
              {cargas.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{new Date(c.data_carga).toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2 text-xs font-medium">{c.funcionario_nome}</td>
                  <td className="px-3 py-2 text-xs">{c.empresa_nome || '—'}</td>
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
                    <Button size="sm" variant="outline" onClick={() => imprimirCarga(c)}>
                      <Printer className="w-3 h-3 mr-1" /> Imprimir
                    </Button>
                    {c.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'conferido')}>Conferir</Button>}
                    {c.status === 'conferido' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'enviado')}>Enviado</Button>}
                    {c.status === 'enviado' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'finalizado')}>Finalizar</Button>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluirCarga(c)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
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
