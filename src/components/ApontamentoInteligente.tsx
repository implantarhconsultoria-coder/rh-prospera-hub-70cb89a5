import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardPaste, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import type { Company, Employee, MonthlyEntry } from '@/types/database';
import type { calcPayrollBreakdown } from '@/lib/calculations';
import { dinheiroLegivel, horasLegiveis, interpretarApontamentos, type ApontamentoLido, type ComissaoModo } from '@/lib/apontamentoInteligente';

type Props = {
  companyId: string; companyName: string; competencia: string; percentualSemanal: number;
  funcionarios: Employee[]; entries: MonthlyEntry[]; fechado: boolean; isAdmin: boolean;
  companies: Company[]; onCompanyChange: (companyId: string) => void;
  calcPayroll: (employee: Employee, entry: MonthlyEntry) => ReturnType<typeof calcPayrollBreakdown>;
  userId?: string; userEmail?: string;
  commissionPct: (employee: Employee, entry: MonthlyEntry) => number;
  onApplied: () => Promise<unknown>; hasPendingWrites: () => boolean;
};

const formatPercent = (percent: number) => percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

const ApontamentoInteligente: React.FC<Props> = (props) => {
  const [searchParams] = useSearchParams();
  const [aberto, setAberto] = useState(() => searchParams.get('inteligente') === '1');
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<ApontamentoLido[]>([]);
  const [analisado, setAnalisado] = useState(false);
  const [modoAplicacao, setModoAplicacao] = useState<'substituir' | 'adicionar'>('substituir');
  const [enviando, setEnviando] = useState(false);
  const entradas = useMemo(() => new Map(props.entries.map(entry => [entry.employeeId, entry])), [props.entries]);

  const analisar = () => {
    setLinhas(interpretarApontamentos(texto, props.funcionarios, props.percentualSemanal));
    setAnalisado(true);
  };
  const pct = (row: ApontamentoLido) => {
    const entry = row.funcionario ? entradas.get(row.funcionario.id) : undefined;
    return row.funcionario && entry ? props.commissionPct(row.funcionario, entry) * 100 : null;
  };
  const valorBase = (row: ApontamentoLido) => {
    if (row.tipo !== 'comissao' || row.modo === 'pendente' || !row.valor || !row.percentual) return null;
    return row.modo === 'base' ? row.valor : Math.round(row.valor / (row.percentual / 100) * 100) / 100;
  };
  const erroDaLinha = (row: ApontamentoLido) => {
    if (row.erro) return row.erro;
    if (!row.funcionario) return 'Escolha o funcionário cadastrado';
    const entry = entradas.get(row.funcionario.id);
    if (!entry) return 'Aguarde o carregamento do lançamento mensal deste funcionário';
    if (entry.bloqueado) return 'Lançamento bloqueado; reabertura autorizada necessária';
    if (row.tipo === 'comissao') {
      if (row.modo === 'pendente') return 'Escolha se o valor é BASE ou COMISSÃO FINAL';
      const expected = pct(row);
      if (expected === null || Math.abs((row.percentual || 0) - expected) > 0.00001)
        return 'Percentual diverge da regra deste funcionário (' + formatPercent(expected || 0) + ')';
      if (!valorBase(row) || (valorBase(row) || 0) > 1e12) return 'Base da comissão inválida';
    }
    return '';
  };
  const simulacoes = useMemo(() => {
    if (!analisado) return [];
    const agrupados = new Map<string, { employee: Employee; atual: MonthlyEntry; previsto: MonthlyEntry }>();
    for (const row of linhas) {
      if (!row.funcionario || !row.tipo || erroDaLinha(row)) continue;
      const atual = entradas.get(row.funcionario.id);
      if (!atual) continue;
      let grupo = agrupados.get(row.funcionario.id);
      if (!grupo) {
        grupo = { employee: row.funcionario, atual, previsto: { ...atual } };
        agrupados.set(row.funcionario.id, grupo);
      }
      const campo = row.tipo === 'comissao' ? 'comissaoBase' : row.tipo;
      const valor = row.tipo === 'comissao' ? valorBase(row) : row.horas;
      if (valor === null || valor === undefined) continue;
      grupo.previsto = { ...grupo.previsto,
        [campo]: Math.round(((modoAplicacao === 'adicionar' ? Number(grupo.previsto[campo] || 0) + valor : valor)) * 1000000) / 1000000,
      };
    }
    return [...agrupados.values()].sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'pt-BR')).map(grupo => ({
      ...grupo, anterior: props.calcPayroll(grupo.employee, grupo.atual),
      calculado: props.calcPayroll(grupo.employee, grupo.previsto),
    }));
  }, [analisado, linhas, entradas, modoAplicacao, props.calcPayroll]);
  const falhas = analisado ? linhas.filter(row => erroDaLinha(row)) : [];
  const repetidas = analisado ? linhas.filter((row, index) => linhas.findIndex(other =>
    other.funcionario?.id === row.funcionario?.id && other.tipo === row.tipo &&
    other.horas === row.horas && other.valor === row.valor && other.percentual === row.percentual &&
    other.modo === row.modo) !== index) : [];

  const confirmar = async () => {
    if (enviando || !props.userId || !props.companyId || !props.competencia) return;
    if (props.fechado || props.hasPendingWrites()) {
      toast.error(props.fechado ? 'Competência fechada: reabra antes de lançar.' : 'Aguarde as edições da grade terminarem de salvar.');
      return;
    }
    if (!linhas.length || falhas.length || repetidas.length) {
      toast.error('Corrija as linhas pendentes ou duplicadas antes de confirmar.');
      return;
    }
    const confirmed = window.confirm('Confirmar ' + linhas.length + ' apontamento(s) de ' + props.companyName +
      ' na competência ' + props.competencia + ' (' + modoAplicacao + ')?');
    if (!confirmed) return;
    setEnviando(true);
    let gravados = 0;
    try {
      const { data: roleRows, error: roleError } = await supabase.from('user_roles')
        .select('role').eq('user_id', props.userId).eq('role', 'admin');
      if (roleError || !roleRows?.length) throw new Error('Acesso de administrador não confirmado no servidor.');
      const { data: closeRow, error: closeError } = await supabase.from('fechamentos_filial')
        .select('status').eq('company_id', props.companyId).eq('competencia', props.competencia).maybeSingle();
      if (closeError) throw closeError;
      if (closeRow?.status === 'fechado') throw new Error('Competência fechada. Solicite reabertura autorizada.');
      const batchSeen = new Set<string>();
      for (const row of linhas) {
        if (!row.funcionario || !row.tipo) throw new Error('Linha incompleta: ' + row.linha);
        const originalEntry = entradas.get(row.funcionario.id);
        if (!originalEntry) throw new Error('Lançamento não encontrado: ' + row.funcionario.name);
        const field = row.tipo === 'comissao' ? 'comissao_base' : row.tipo;
        const delta = row.tipo === 'comissao' ? valorBase(row) : row.horas;
        if (delta === null || delta === undefined) throw new Error('Valor inválido: linha ' + row.linha);
        const fingerprint = [props.competencia, props.companyId, row.funcionario.id, field,
          row.tipo === 'comissao' ? row.valor : row.horas, row.percentual, row.modo || '', row.original.trim().toLowerCase()].join('|');
        if (batchSeen.has(fingerprint)) throw new Error('Linha duplicada: ' + row.funcionario.name);
        batchSeen.add(fingerprint);
        if (modoAplicacao === 'adicionar') {
          const { data: prior, error: priorError } = await supabase.from('acoes_log').select('id')
            .eq('modulo', 'fechamento_inteligente').eq('acao', 'apontamento_lancado').eq('observacao', fingerprint).limit(1);
          if (priorError) throw priorError;
          if (prior?.length) throw new Error('Este apontamento já foi somado anteriormente: ' + row.funcionario.name);
        }
        const { data: current, error: readError } = await supabase.from('lancamentos_mensais')
          .select('id,company_id,funcionario_id,competencia,he50,he100,comissao_base,bloqueado')
          .eq('funcionario_id', row.funcionario.id).eq('company_id', props.companyId)
          .eq('competencia', props.competencia).is('apagado_em', null).maybeSingle();
        if (readError) throw readError;
        if (!current?.id || current.bloqueado) throw new Error('Registro inexistente ou bloqueado: ' + row.funcionario.name);
        const antes = Number(current[field] || 0);
        const depois = Math.round((modoAplicacao === 'adicionar' ? antes + delta : delta) * 1000000) / 1000000;
        if (Math.abs(antes - depois) < 0.0000001) continue;
        const { data: saved, error: writeError } = await supabase.from('lancamentos_mensais')
          .update({ [field]: depois, user_id: props.userId })
          .eq('id', current.id).eq('company_id', props.companyId).eq('competencia', props.competencia)
          .eq(field, antes).eq('bloqueado', false).select('id').maybeSingle();
        if (writeError || !saved?.id) throw writeError || new Error('Registro alterado por outra sessão; recarregue antes de tentar novamente.');
        const { error: auditError } = await supabase.from('acoes_log').insert({
          modulo: 'fechamento_inteligente', entidade: 'lancamentos_mensais', entidade_id: current.id,
          acao: 'apontamento_lancado', funcionario_id: row.funcionario.id,
          funcionario_nome: row.funcionario.name, empresa: props.companyName, user_id: props.userId,
          user_email: props.userEmail || '', origem: 'app',
          antes: { competencia: props.competencia, campo: field, valor: antes },
          depois: { competencia: props.competencia, campo: field, valor: depois, tipo: row.tipo,
            percentual: row.percentual, modo: row.modo, valorDigitado: row.valor, texto: row.original,
            aplicacao: modoAplicacao }, observacao: fingerprint,
        });
        if (auditError) {
          const rollback = await supabase.from('lancamentos_mensais').update({ [field]: antes })
            .eq('id', current.id).eq(field, depois);
          throw new Error('Falha na auditoria; ' + (rollback.error ? 'correção automática também falhou: confira o lançamento!' : 'lançamento revertido.') + ' ' + auditError.message);
        }
        gravados++;
      }
      await props.onApplied();
      toast.success(gravados ? gravados + ' apontamento(s) aplicados e auditados.' : 'Os valores já estavam iguais; nada foi duplicado.');
      setAnalisado(false); setLinhas([]); setTexto('');
    } catch (error) {
      await props.onApplied();
      toast.error((error instanceof Error ? error.message : String(error)) +
        (gravados ? ' ' + gravados + ' linha(s) anterior(es) já foram salvas; revise antes de repetir.' : ''));
    } finally { setEnviando(false); }
  };

  if (!props.isAdmin) return null;
  return <section className="card-premium space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-base font-bold"><ClipboardPaste className="h-5 w-5 text-violet-400" /> Apontamento Inteligente</h2>
        <p className="text-xs text-muted-foreground">Horas e comissões em lote, com prévia por funcionário e competência.</p></div>
      <Button type="button" variant="outline" onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar janela' : 'Abrir janela inteligente'}</Button>
    </div>
    {aberto && <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[260px] flex-col gap-1 text-xs font-semibold text-violet-200">Empresa / filial
          <select className="h-10 rounded border border-violet-400/30 bg-background p-2 text-sm"
            value={props.companyId} disabled={enviando}
            onChange={event => { props.onCompanyChange(event.target.value); setAnalisado(false); setLinhas([]); }}>
            {props.companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Competência: <strong>{props.competencia}</strong> • Extra semanal: {formatPercent(props.percentualSemanal)}.</p>
      </div>
      <textarea value={texto} onChange={event => { setTexto(event.target.value); setAnalisado(false); }}
        disabled={enviando} className="min-h-[135px] w-full rounded-lg border border-violet-400/30 bg-background p-3 text-sm outline-none focus:border-violet-400"
        placeholder={'Ana Clara 2.00 ' + props.percentualSemanal + '%\nFrancinaldo 2:55 100%\nAbinadab 369,50 comissão final 1%\nAldenei 5283,40 comissão final 2%'} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={analisar} disabled={!texto.trim() || enviando}>Analisar apontamentos</Button>
        <label className="text-xs">Ao confirmar: <select value={modoAplicacao} disabled={enviando}
          onChange={event => setModoAplicacao(event.target.value as 'substituir' | 'adicionar')}
          className="rounded border border-violet-400/30 bg-background p-2">
          <option value="substituir">Substituir somente os campos informados</option>
          <option value="adicionar">Adicionar aos valores existentes</option>
        </select></label>
      </div>
      {analisado && <div className="space-y-2">
        <p className="text-xs font-bold">Prévia — {linhas.length} linha(s), {falhas.length + repetidas.length} pendência(s). Nenhuma informação é salva na análise.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-xs">
          <thead><tr className="border-b border-violet-400/30 text-left"><th className="p-2">Funcionário</th><th className="p-2">Tipo</th><th className="p-2">Informado</th><th className="p-2">Base</th><th className="p-2">Já lançado</th><th className="p-2">Resultado</th><th className="p-2">Conferência</th></tr></thead>
          <tbody>{linhas.map(row => {
            const entry = row.funcionario ? entradas.get(row.funcionario.id) : undefined;
            const field = row.tipo === 'comissao' ? 'comissaoBase' : row.tipo;
            const before = entry && field ? Number(entry[field] || 0) : 0;
            const delta = row.tipo === 'comissao' ? valorBase(row) : row.horas;
            const after = delta === null || delta === undefined ? null : modoAplicacao === 'adicionar' ? before + delta : delta;
            const status = erroDaLinha(row);
            return <tr key={row.key} className="border-b border-violet-400/10 align-top">
              <td className="p-2"><strong>{row.funcionario?.name || row.nomeDigitado || 'Não identificado'}</strong>
                {!row.funcionario && <select value="" onChange={event => {
                  const emp = props.funcionarios.find(e => e.id === event.target.value);
                  if (emp) setLinhas(prev => prev.map(x => x.key === row.key ? { ...x, funcionario: emp, erro: undefined } : x));
                }} className="mt-1 block w-full max-w-48 rounded border bg-background p-1"><option value="">Selecionar cadastro...</option>
                  {props.funcionarios.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>}</td>
              <td className="p-2">{row.tipo === 'comissao' ? 'Comissão' : row.tipo === 'he100' ? 'HE 100%' : row.tipo === 'he50' ? 'HE ' + props.percentualSemanal + '%' : '—'}</td>
              <td className="p-2">{row.tipo === 'comissao' ? dinheiroLegivel(row.valor || 0) + ' a ' + formatPercent(row.percentual || 0) :
                row.horas !== undefined ? horasLegiveis(row.horas) : row.original}
                {row.tipo === 'comissao' && <select className="mt-1 block rounded border bg-background p-1" value={row.modo}
                  onChange={event => setLinhas(prev => prev.map(x => x.key === row.key ? { ...x, modo: event.target.value as ComissaoModo } : x))}>
                  <option value="pendente">Confirmar tipo...</option><option value="base">Base</option><option value="final">Comissão final</option>
                </select>}</td>
              <td className="p-2">{row.tipo === 'comissao' && valorBase(row) !== null ? dinheiroLegivel(valorBase(row) || 0) : '—'}</td>
              <td className="p-2">{row.tipo === 'comissao' ? dinheiroLegivel(before) : horasLegiveis(before)}</td>
              <td className="p-2">{after === null ? 'Pendente' : row.tipo === 'comissao' ? dinheiroLegivel(after) : horasLegiveis(after)}</td>
              <td className={'p-2 ' + (status ? 'text-amber-400' : 'text-emerald-400')}>{status || (repetidas.includes(row) ? 'Linha duplicada' : 'Conferido')}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/[.06] p-3 space-y-2">
          <p className="text-sm font-bold text-emerald-200">Simulação do valor a receber — por funcionário</p>
          <p className="text-xs text-muted-foreground">Cálculo completo com salário, adicionais, horas extras, DSR, comissão, INSS, IRRF, adiantamento e descontos. Apenas prévia; ainda não foi lançado.</p>
          {simulacoes.length === 0 && <p className="text-xs text-amber-300">Nenhum funcionário validado nesta empresa. Se os nomes são de Goiânia, selecione TOPAC Goiânia acima.</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[830px] text-xs">
            <thead className="border-b border-emerald-400/20 text-left"><tr>
              <th className="p-2">Funcionário</th><th className="p-2">HE semanal</th><th className="p-2">HE 100%</th>
              <th className="p-2">Comissão</th><th className="p-2">DSR total</th><th className="p-2">Bruto</th>
              <th className="p-2">Líquido anterior</th><th className="p-2">Valor a receber (previsto)</th>
            </tr></thead>
            <tbody>{simulacoes.map(item => <tr key={item.employee.id} className="border-b border-emerald-400/10">
              <td className="p-2 font-bold">{item.employee.name}</td>
              <td className="p-2">{horasLegiveis(item.previsto.he50)}<br />{dinheiroLegivel(item.calculado.he50Val)}</td>
              <td className="p-2">{horasLegiveis(item.previsto.he100)}<br />{dinheiroLegivel(item.calculado.he100Val)}</td>
              <td className="p-2">{dinheiroLegivel(item.calculado.comissaoVal)}
                <br /><span className="text-muted-foreground">Base {dinheiroLegivel(item.previsto.comissaoBase)}</span></td>
              <td className="p-2">{dinheiroLegivel(item.calculado.dsrHE + item.calculado.dsrComissao)}</td>
              <td className="p-2">{dinheiroLegivel(item.calculado.bruto)}</td>
              <td className="p-2">{dinheiroLegivel(item.anterior.liquido)}</td>
              <td className="p-2 text-base font-bold text-emerald-300">{dinheiroLegivel(item.calculado.liquido)}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="text-sm font-bold text-emerald-200">Total líquido previsto destes funcionários: {dinheiroLegivel(simulacoes.reduce((sum, item) => sum + item.calculado.liquido, 0))}</p>
        </div>
        {props.fechado && <p className="text-sm text-amber-400">Competência fechada: lançamento bloqueado até reabertura autorizada.</p>}
        <Button disabled={enviando || props.fechado || !!falhas.length || !!repetidas.length || !linhas.length}
          onClick={confirmar}><ShieldCheck className="mr-2 h-4 w-4" />{enviando ? 'Salvando e auditando...' : 'Confirmar e lançar no fechamento'}</Button>
      </div>}
    </div>}
  </section>;
};
export default ApontamentoInteligente;
