import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck, Lock, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DecimalInput, MoneyInput } from '@/components/ui/number-format-input';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { employeeHasInsalubridade } from '@/lib/employeeRoleRules';
import { obterAtorAtual, registrarAcao } from '@/lib/acoesLog';
import { registrarAlertaFilial } from '@/lib/alertasFilial';
import type { MovimentoRow, FechamentoRow, TipoOcorrencia } from '@/lib/movimento';

const GRID_MARK = '__GRADE_FILIAL__';
const FALTAS_RE = /FALTAS:\s*([^|]+)/i;
const HOURS_DOC_RE = /DECLARACAO\/ATESTADO HORAS:\s*\+([\d.,]+)h/i;

const FilialFechamentoPage: React.FC = () => {
  const { companies, employees } = useApp();
  const filial = useFilialFilter();
  const ext = useAcessoExternoFiltro();
  const companyId = ext.isExterno ? (ext.empresaIds?.[0] || '') : (filial.filialCompanyId || '');
  const empresaAtual = companies.find((c) => c.id === companyId);
  const empresaNome = empresaAtual?.name || ext.empresaNome || 'Filial autorizada';

  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [movimentos, setMovimentos] = useState<MovimentoRow[]>([]);
  const [fechamento, setFechamento] = useState<FechamentoRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [processando, setProcessando] = useState(false);

  const carregar = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    const [mov, fech] = await Promise.all([
      supabase.from('movimento_diario').select('*').eq('company_id', companyId).eq('competencia', competencia).order('created_at', { ascending: true }),
      supabase.from('fechamentos_filial').select('*').eq('company_id', companyId).eq('competencia', competencia).maybeSingle(),
    ]);
    if (mov.error) toast.error(mov.error.message);
    setMovimentos((mov.data as any) || []);
    setFechamento((fech.data as any) || null);
    setLoading(false);
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [companyId, competencia]);

  const fechado = fechamento?.status === 'fechado';
  const compEmps = useMemo(
    () => employees.filter((e) => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional'),
    [employees, companyId],
  );

  const hePct = getHoraExtraSemanalPercentual(empresaAtual || companyId);
  const heLabel = `HE ${hePct}%`;
  const diasUteis = getWorkingDays(competencia);
  const [yy, mm] = competencia.split('-').map(Number);
  const domingosFeriados = yy && mm ? new Date(yy, mm, 0).getDate() - diasUteis : 0;
  const comissaoPct = getComissaoPercentual(empresaAtual);

  const rowsFor = (employeeId: string, tipo?: TipoOcorrencia) =>
    movimentos.filter((m) => m.funcionario_id === employeeId && (!tipo || m.tipo === tipo));

  const aggregate = (employeeId: string, tipo: TipoOcorrencia, field: 'quantidade' | 'valor') =>
    rowsFor(employeeId, tipo).reduce((sum, row) => sum + Number(row[field] || 0), 0);

  const metaRow = (employeeId: string) =>
    rowsFor(employeeId, 'observacao').filter((r) => String(r.observacao || '').startsWith(GRID_MARK)).at(-1);

  const metaText = (employeeId: string) => String(metaRow(employeeId)?.observacao || '').replace(GRID_MARK, '').replace(/^\s*\|\s*/, '').trim();
  const faltaDatas = (employeeId: string) => metaText(employeeId).match(FALTAS_RE)?.[1]?.trim() || '';
  const horasDoc = (employeeId: string) => Number(String(metaText(employeeId).match(HOURS_DOC_RE)?.[1] || '0').replace(',', '.')) || 0;
  const observacaoLivre = (employeeId: string) => metaText(employeeId)
    .replace(/(^|\s*\|\s*)FALTAS:\s*[^|]+/i, '')
    .replace(/(^|\s*\|\s*)DECLARACAO\/ATESTADO HORAS:\s*\+[\d.,]+h/i, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();

  const saveAggregate = async (employeeId: string, tipo: TipoOcorrencia, desired: number, usaValor = false) => {
    if (fechado) return toast.error('Período fechado. Para alterar, solicite reabertura à central.');
    if (!companyId) return;
    const key = `${employeeId}-${tipo}`;
    setSavingKey(key);
    try {
      const field = usaValor ? 'valor' : 'quantidade';
      const typeRows = rowsFor(employeeId, tipo);
      const grid = typeRows.find((r) => String(r.observacao || '').startsWith(GRID_MARK));
      const otherTotal = typeRows.filter((r) => r.id !== grid?.id).reduce((sum, r) => sum + Number((r as any)[field] || 0), 0);
      const gridValue = Number(desired || 0) - otherTotal;
      const ator = await obterAtorAtual();

      if (grid) {
        const patch:any = { [field]: gridValue, registrado_por_nome: ator.funcionarioNome || ator.userEmail || 'Filial' };
        const { error } = await supabase.from('movimento_diario').update(patch).eq('id', grid.id).eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('movimento_diario').insert({
          company_id: companyId,
          funcionario_id: employeeId,
          competencia,
          data: `${competencia}-01`,
          tipo,
          quantidade: usaValor ? 0 : gridValue,
          valor: usaValor ? gridValue : 0,
          observacao: `${GRID_MARK} | edição pela grade`,
          registrado_por_user_id: ator.userId || null,
          registrado_por_nome: ator.funcionarioNome || ator.userEmail || 'Filial',
        } as any);
        if (error) throw error;
      }
      await carregar();
    } catch (e:any) {
      toast.error(e?.message || 'Não foi possível salvar o apontamento.');
    } finally {
      setSavingKey('');
    }
  };

  const saveMeta = async (employeeId: string, patch: { datas?: string; horasDoc?: number; obs?: string }) => {
    if (fechado) return toast.error('Período fechado. Para alterar, solicite reabertura à central.');
    const key = `${employeeId}-meta`;
    setSavingKey(key);
    try {
      const currentDatas = patch.datas ?? faltaDatas(employeeId);
      const currentHoras = patch.horasDoc ?? horasDoc(employeeId);
      const currentObs = patch.obs ?? observacaoLivre(employeeId);
      const text = [
        GRID_MARK,
        currentDatas.trim() ? `FALTAS: ${currentDatas.trim()}` : '',
        currentHoras > 0 ? `DECLARACAO/ATESTADO HORAS: +${currentHoras.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '',
        currentObs.trim(),
      ].filter(Boolean).join(' | ');
      const ator = await obterAtorAtual();
      const existing = metaRow(employeeId);
      if (existing) {
        const { error } = await supabase.from('movimento_diario').update({ observacao: text, registrado_por_nome: ator.funcionarioNome || ator.userEmail || 'Filial' } as any).eq('id', existing.id).eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('movimento_diario').insert({
          company_id: companyId, funcionario_id: employeeId, competencia, data: `${competencia}-01`,
          tipo: 'observacao', quantidade: 0, valor: 0, observacao: text,
          registrado_por_user_id: ator.userId || null, registrado_por_nome: ator.funcionarioNome || ator.userEmail || 'Filial',
        } as any);
        if (error) throw error;
      }
      await carregar();
    } catch (e:any) {
      toast.error(e?.message || 'Não foi possível salvar a observação.');
    } finally {
      setSavingKey('');
    }
  };

  const calcEntry = (emp:any) => {
    const entry:any = {
      employeeId: emp.id, companyId, competencia,
      faltasDias: aggregate(emp.id, 'falta', 'quantidade'),
      atrasos: aggregate(emp.id, 'atraso', 'quantidade'),
      he50: aggregate(emp.id, 'he50', 'quantidade'),
      he100: aggregate(emp.id, 'he100', 'quantidade'),
      comissaoBase: aggregate(emp.id, 'comissao', 'valor'),
      adicionais: aggregate(emp.id, 'adicional', 'valor'),
      descontosDiversos: aggregate(emp.id, 'desconto', 'valor'),
      adiantamento: aggregate(emp.id, 'adiantamento', 'valor') || Math.round(emp.salarioBase * 0.4 * 100) / 100,
      vrAplicado: emp.vrAtivo, vrDias: 0, vaAplicado: emp.vaAtivo, vtAplicado: emp.vtAtivo, vtDesconto: 0,
      insalubridadeAplicada: employeeHasInsalubridade(emp), observacoes: metaText(emp.id), statusConferencia: 'pendente',
    };
    return { entry, calc: calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: hePct }) };
  };

  const totals = useMemo(() => compEmps.reduce((acc, emp) => {
    const { calc } = calcEntry(emp);
    acc.proventos += calc.proventos;
    acc.descontos += calc.descontosLegais + calc.descontosOperacionais + calc.adiantamento + calc.descontosDiversos;
    acc.liquido += calc.liquido;
    return acc;
  }, { proventos: 0, descontos: 0, liquido: 0 }), [compEmps, movimentos, competencia]);

  const enviarCentral = async () => {
    if (!companyId || !empresaAtual) return toast.error('Filial não autorizada.');
    if (!confirm(`Enviar fechamento de ${empresaNome} • ${competencia} para a central?\n\nDepois do envio o período ficará travado para a filial.`)) return;
    setProcessando(true);
    try {
      const ator = await obterAtorAtual();
      const { data: fechRow, error: fechErr } = await supabase.from('fechamentos_filial').upsert({
        company_id: companyId, empresa_nome: empresaNome, competencia, status: 'fechado',
        fechado_por_user_id: ator.userId || null,
        fechado_por_nome: ator.funcionarioNome || ator.userEmail || 'Filial',
        fechado_em: new Date().toISOString(),
        total_funcionarios: compEmps.length,
        total_proventos: totals.proventos,
        total_descontos: totals.descontos,
        total_liquido: totals.liquido,
      } as any, { onConflict: 'company_id,competencia' }).select().single();
      if (fechErr) throw fechErr;
      const fechamentoId = (fechRow as any).id;

      for (const emp of compEmps) {
        const { entry } = calcEntry(emp);
        const payload:any = {
          company_id: companyId, funcionario_id: emp.id, competencia,
          faltas_dias: entry.faltasDias, atrasos: entry.atrasos, he50: entry.he50, he100: entry.he100,
          comissao_base: entry.comissaoBase, adicionais: entry.adicionais, descontos_diversos: entry.descontosDiversos,
          adiantamento: entry.adiantamento, vr_aplicado: emp.vrAtivo, va_aplicado: emp.vaAtivo, vt_aplicado: emp.vtAtivo,
          insalubridade_aplicada: entry.insalubridadeAplicada,
          observacoes: metaText(emp.id).slice(0, 500), status_conferencia: 'pendente',
          fechamento_id: fechamentoId, origem: 'consolidado', bloqueado: true,
        };
        const { data: existing } = await supabase.from('lancamentos_mensais').select('id').eq('company_id', companyId).eq('funcionario_id', emp.id).eq('competencia', competencia).maybeSingle();
        if (existing) {
          const { error } = await supabase.from('lancamentos_mensais').update(payload).eq('id', (existing as any).id).eq('company_id', companyId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('lancamentos_mensais').insert(payload);
          if (error) throw error;
        }
      }

      await supabase.from('fechamentos_historico').insert({
        fechamento_id: fechamentoId, acao: 'fechado', user_id: ator.userId || null,
        usuario_nome: ator.funcionarioNome || ator.userEmail || 'Filial',
        detalhes: { total_funcionarios: compEmps.length, total_proventos: totals.proventos, total_descontos: totals.descontos, total_liquido: totals.liquido },
      } as any);

      await registrarAcao({ modulo: 'filial', entidade: 'fechamento', entidadeId: fechamentoId, acao: 'enviou', depois: { companyId, competencia, totals } }, ator);
      await registrarAlertaFilial({ filial: ext.filialNome || empresaNome, empresaNome, modulo: 'fechamento', acao: `Fechamento ${competencia} enviado para a central`, nivel: 'informativo', dadoNovo: { totals } });
      toast.success('Fechamento enviado para a central.');
      await carregar();
    } catch (e:any) {
      toast.error(e?.message || 'Não foi possível enviar o fechamento.');
    } finally {
      setProcessando(false);
    }
  };

  const inputClass = 'h-7 w-full min-w-0 border-violet-400/20 bg-black/20 px-1 text-[10px] focus:border-violet-400/60';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display">Apontamento / Fechamento</h1>
          <p className="text-sm text-muted-foreground">Mesma grade da central, limitada aos funcionários desta filial.</p>
        </div>
        <Badge variant="outline" className={fechado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-violet-500/30 bg-violet-500/10 text-violet-300'}>
          {fechado ? 'ENVIADO / FECHADO' : 'ABERTO'}
        </Badge>
      </div>

      <div className="card-premium flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[240px] rounded-lg border border-violet-400/20 bg-background px-3 py-2 text-sm font-semibold">{empresaNome}</div>
        <Input type="month" value={competencia} onChange={(e)=>setCompetencia(e.target.value)} className="w-48" />
        <span className="text-xs text-muted-foreground">Dias úteis: <b className="text-foreground">{diasUteis}</b></span>
        <span className="text-xs text-muted-foreground">Dom/Feriados: <b className="text-foreground">{domingosFeriados}</b></span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={()=>void carregar()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`} />Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card-premium p-4"><p className="text-[10px] uppercase text-muted-foreground">Funcionários</p><p className="mt-1 text-xl font-black text-amber-300">{compEmps.length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] uppercase text-muted-foreground">Proventos estimados</p><p className="mt-1 text-xl font-black">{formatCurrency(totals.proventos)}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] uppercase text-muted-foreground">Descontos estimados</p><p className="mt-1 text-xl font-black text-amber-300">{formatCurrency(totals.descontos)}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] uppercase text-muted-foreground">Líquido estimado</p><p className="mt-1 text-xl font-black text-violet-300">{formatCurrency(totals.liquido)}</p></div>
      </div>

      <section className="card-premium overflow-hidden">
        <div className="border-b border-violet-400/20 p-4">
          <h2 className="font-bold">Apontamento para Contabilidade</h2>
          <p className="text-xs text-muted-foreground">Preencha direto na linha do funcionário. As alterações ficam salvas na filial e serão consolidadas ao enviar.</p>
        </div>
        <div className="w-full overflow-auto">
          <table className="w-full min-w-[1450px] table-fixed text-[10px]">
            <thead className="sticky top-0 z-20 bg-[#070a0f]">
              <tr className="border-b border-violet-400/30">
                {['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heLabel,'HE 100%','DSR','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((h,i)=>
                  <th key={h} style={{width:['12%','7%','4%','6%','5%','5%','5%','5%','6%','7%','6%','6%','7%','7%','12%'][i]}} className="px-1 py-2 text-left text-[8px] font-extrabold uppercase text-violet-100">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {compEmps.map((emp)=>{
                const {entry,calc}=calcEntry(emp);
                return <tr key={emp.id} className="border-b border-violet-400/10 align-top hover:bg-violet-500/[0.025]">
                  <td className="px-1 py-2 text-[9px] font-semibold">{emp.name}</td>
                  <td className="px-1 py-2 text-[8px] text-muted-foreground">{empresaNome}</td>
                  <td className="px-1 py-1.5"><DecimalInput value={entry.faltasDias} decimals={1} disabled={fechado||savingKey===`${emp.id}-falta`} onValueChange={(v)=>void saveAggregate(emp.id,'falta',v)} className={inputClass}/></td>
                  <td className="px-1 py-1.5"><Input defaultValue={faltaDatas(emp.id)} disabled={fechado} onBlur={(e)=>void saveMeta(emp.id,{datas:e.target.value})} placeholder="Ex.: 03, 17" className={inputClass}/></td>
                  <td className="px-1 py-1.5"><DecimalInput value={entry.atrasos} decimals={2} disabled={fechado||savingKey===`${emp.id}-atraso`} onValueChange={(v)=>void saveAggregate(emp.id,'atraso',v)} className={inputClass}/><div className="mt-1 text-muted-foreground">{formatCurrency(calc.atrasoVal)}</div></td>
                  <td className="px-1 py-1.5"><DecimalInput value={horasDoc(emp.id)} decimals={2} disabled={fechado} onValueChange={(v)=>void saveMeta(emp.id,{horasDoc:v})} className={inputClass}/></td>
                  <td className="px-1 py-1.5"><DecimalInput value={entry.he50} decimals={2} disabled={fechado||savingKey===`${emp.id}-he50`} onValueChange={(v)=>void saveAggregate(emp.id,'he50',v)} className={inputClass}/><div className="mt-1 text-violet-300">{formatCurrency(calc.he50Val)}</div></td>
                  <td className="px-1 py-1.5"><DecimalInput value={entry.he100} decimals={2} disabled={fechado||savingKey===`${emp.id}-he100`} onValueChange={(v)=>void saveAggregate(emp.id,'he100',v)} className={inputClass}/><div className="mt-1 text-violet-300">{formatCurrency(calc.he100Val)}</div></td>
                  <td className="px-1 py-2 font-bold text-emerald-300">{formatCurrency(calc.dsrHE+calc.dsrComissao)}</td>
                  <td className="px-1 py-1.5"><MoneyInput value={entry.comissaoBase} disabled={fechado||savingKey===`${emp.id}-comissao`} onValueChange={(v)=>void saveAggregate(emp.id,'comissao',v,true)} className={inputClass}/><div className="mt-1 text-amber-300">{(calc.comissaoPct*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}% = {formatCurrency(calc.comissaoVal)}</div></td>
                  <td className="px-1 py-1.5"><MoneyInput value={entry.adicionais} disabled={fechado||savingKey===`${emp.id}-adicional`} onValueChange={(v)=>void saveAggregate(emp.id,'adicional',v,true)} className={inputClass}/></td>
                  <td className="px-1 py-1.5"><MoneyInput value={entry.descontosDiversos} disabled={fechado||savingKey===`${emp.id}-desconto`} onValueChange={(v)=>void saveAggregate(emp.id,'desconto',v,true)} className={inputClass}/></td>
                  <td className="px-1 py-1.5"><MoneyInput value={entry.adiantamento} disabled={fechado||savingKey===`${emp.id}-adiantamento`} onValueChange={(v)=>void saveAggregate(emp.id,'adiantamento',v,true)} className={inputClass}/></td>
                  <td className="px-1 py-2 text-[9px] font-extrabold text-violet-200">{formatCurrency(calc.liquido)}</td>
                  <td className="px-1 py-1.5"><Input defaultValue={observacaoLivre(emp.id)} disabled={fechado} onBlur={(e)=>void saveMeta(emp.id,{obs:e.target.value})} placeholder="Observação..." className={inputClass}/></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="card-premium flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-xs text-muted-foreground">
          {fechado ? 'Período enviado. Para alterar, a central precisa reabrir.' : 'Revise a grade e envie quando estiver pronta.'}
        </div>
        {!fechado && <Button onClick={()=>void enviarCentral()} disabled={processando||!companyId||compEmps.length===0} className="gradient-primary text-primary-foreground">
          {processando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
          Enviar fechamento para a central
        </Button>}
        {fechado && <Button variant="outline" disabled><Lock className="mr-2 h-4 w-4"/>Enviado para a central</Button>}
      </div>
    </div>
  );
};

export default FilialFechamentoPage;
