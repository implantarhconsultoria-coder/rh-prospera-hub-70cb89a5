import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileX, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  calcularTrct, causaLabel, codigoAfastamentoSugerido,
  type CausaAfastamento, type TrctResultado,
} from '@/lib/trctCalc';
import { buildTrctHtml } from '@/lib/trctPdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { formatCurrency } from '@/lib/calculations';
import { registrarAcao } from '@/lib/acoesLog';

type RubricaKey = keyof TrctResultado;

const RescisaoPage: React.FC = () => {
  const { session, employees, companies } = useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [empId, setEmpId] = useState('');
  const [dataAviso, setDataAviso] = useState(new Date().toISOString().slice(0, 10));
  const [dataAfastamento, setDataAfastamento] = useState(new Date().toISOString().slice(0, 10));
  const [causa, setCausa] = useState<CausaAfastamento>('sj_empregador');
  const [avisoTrabalhado, setAvisoTrabalhado] = useState(false);
  const [diasAviso, setDiasAviso] = useState<number | undefined>(undefined);
  const [remuneracao, setRemuneracao] = useState(0);
  const [insalPct, setInsalPct] = useState(0);
  const [insalBase, setInsalBase] = useState(1518);
  const [comissoes, setComissoes] = useState(0);
  const [horasExtras, setHorasExtras] = useState(0);
  const [feriasVencidasMeses, setFeriasVencidasMeses] = useState(0);

  const [adiantSal, setAdiantSal] = useState(0);
  const [vt, setVt] = useState(0);
  const [vr, setVr] = useState(0);
  const [arred, setArred] = useState(0);
  const [observacoes, setObservacoes] = useState('');

  // overrides manuais por rubrica (depois do cálculo)
  const [overrides, setOverrides] = useState<Partial<Record<RubricaKey, number>>>({});

  const fetchList = async () => {
    setLoading(true);
    const { data } = await supabase.from('rescisoes').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchList(); }, []);

  const emp = employees.find(e => e.id === empId);
  const empresa = emp ? companies.find(c => c.id === emp.companyId) : null;

  // pré-popular salário/insalubridade quando funcionário muda
  useEffect(() => {
    if (emp) {
      setRemuneracao(Number(emp.salarioBase || 0));
      setInsalPct(emp.insalubridadeAtiva ? 40 : 0);
    }
  }, [emp]);

  const baseResult = useMemo<TrctResultado | null>(() => {
    if (!emp) return null;
    return calcularTrct({
      salarioBase: Number(emp.salarioBase || 0),
      remuneracaoMesAnterior: remuneracao || Number(emp.salarioBase || 0),
      insalubridadePct: insalPct,
      insalubridadeBase: insalBase,
      comissoes,
      horasExtrasValor: horasExtras,
      dependentes: 0,
      dataAdmissao: emp.dataAdmissao || new Date().toISOString().slice(0, 10),
      dataAviso,
      dataAfastamento,
      causa,
      avisoTrabalhado,
      diasAviso,
      adiantamentoSalarial: adiantSal,
      valeTransporte: vt,
      valeRefeicao: vr,
      arredondamentoAnterior: arred,
      feriasVencidasMeses,
    });
  }, [emp, remuneracao, insalPct, insalBase, comissoes, horasExtras, dataAviso, dataAfastamento, causa, avisoTrabalhado, diasAviso, adiantSal, vt, vr, arred, feriasVencidasMeses]);

  // resultado final = base + overrides + recalcula totais
  const resultado = useMemo<TrctResultado | null>(() => {
    if (!baseResult) return null;
    const merged = { ...baseResult, ...overrides } as TrctResultado;
    const verbasKeys: RubricaKey[] = [
      'v50_saldoDiasSalario','v51_comissoes','v52_gratificacao','v53_insalubridade','v54_periculosidade',
      'v55_adicNoturno','v56_horasExtras','v57_gorjetas','v58_dsr','v59_reflexoDsr','v60_multa477',
      'v61_multa479','v62_salarioFamilia','v63_13Proporcional','v64_13Exercicio','v65_feriasProporcionais',
      'v66_feriasVencidas','v68_tercoFerias','v69_avisoIndenizado','v70_13SobreAviso','v71_feriasSobreAviso',
    ];
    const dedKeys: RubricaKey[] = [
      'd100_pensao','d101_adiantamento','d102_adiant13','d103_avisoIndenizado','d104_indenizacao480',
      'd105_emprestimoConsig','d106_valeTransporte','d112_1_inss','d112_2_inss13','d114_1_irrf',
      'd114_2_irrf13','d115_2_arredondamento','d115_3_valeRefeicao',
    ];
    const totalBruto = verbasKeys.reduce((s, k) => s + Number(merged[k] || 0), 0);
    const totalDedu = dedKeys.reduce((s, k) => s + Number(merged[k] || 0), 0);
    return {
      ...merged,
      totalBruto: Math.round(totalBruto * 100) / 100,
      totalDedu: Math.round(totalDedu * 100) / 100,
      liquidoRescisorio: Math.round((totalBruto - totalDedu) * 100) / 100,
    };
  }, [baseResult, overrides]);

  const handleSalvar = async () => {
    if (!emp || !empresa || !resultado || !session) return toast.error('Selecione um funcionário');
    if (!emp.id) return toast.error('Funcionário inválido');
    setSaving(true);
    try {
      const payload: any = {
        funcionario_id: emp.id,
        funcionario_nome: emp.name,
        company_id: emp.companyId,
        empresa_nome: empresa.name,
        cargo: emp.cargo,
        cpf: emp.cpf,
        data_admissao: emp.dataAdmissao || null,
        data_desligamento: dataAfastamento,
        data_aviso: dataAviso,
        tipo_rescisao: causa,
        causa_afastamento: causaLabel(causa),
        codigo_afastamento: codigoAfastamentoSugerido(causa),
        aviso_previo: avisoTrabalhado ? 'trabalhado' : 'indenizado',
        dias_aviso: resultado.diasAviso,
        salario_base: emp.salarioBase,
        remuneracao_mes_anterior: remuneracao,
        dependentes: 0,
        // verbas
        verba_50_saldo_dias: resultado.v50_saldoDiasSalario,
        verba_51_comissoes: resultado.v51_comissoes,
        verba_52_gratificacao: resultado.v52_gratificacao,
        verba_53_insalubridade: resultado.v53_insalubridade,
        verba_54_periculosidade: resultado.v54_periculosidade,
        verba_55_adic_noturno: resultado.v55_adicNoturno,
        verba_56_horas_extras: resultado.v56_horasExtras,
        verba_57_gorjetas: resultado.v57_gorjetas,
        verba_58_dsr: resultado.v58_dsr,
        verba_59_reflexo_dsr: resultado.v59_reflexoDsr,
        verba_60_multa_477: resultado.v60_multa477,
        verba_61_multa_479: resultado.v61_multa479,
        verba_62_salario_familia: resultado.v62_salarioFamilia,
        verba_63_13_proporcional: resultado.v63_13Proporcional,
        verba_64_13_exercicio: resultado.v64_13Exercicio,
        verba_65_ferias_proporcionais: resultado.v65_feriasProporcionais,
        verba_66_ferias_vencidas: resultado.v66_feriasVencidas,
        verba_68_terco_ferias: resultado.v68_tercoFerias,
        verba_69_aviso_indenizado: resultado.v69_avisoIndenizado,
        verba_70_13_sobre_aviso: resultado.v70_13SobreAviso,
        verba_71_ferias_sobre_aviso: resultado.v71_feriasSobreAviso,
        // deducoes
        ded_100_pensao: resultado.d100_pensao,
        ded_101_adiantamento: resultado.d101_adiantamento,
        ded_102_adiant_13: resultado.d102_adiant13,
        ded_103_aviso_indenizado: resultado.d103_avisoIndenizado,
        ded_104_indenizacao_480: resultado.d104_indenizacao480,
        ded_105_emprestimo_consig: resultado.d105_emprestimoConsig,
        ded_106_vale_transporte: resultado.d106_valeTransporte,
        ded_112_1_inss: resultado.d112_1_inss,
        ded_112_2_inss_13: resultado.d112_2_inss13,
        ded_114_1_irrf: resultado.d114_1_irrf,
        ded_114_2_irrf_13: resultado.d114_2_irrf13,
        ded_115_2_arredondamento: resultado.d115_2_arredondamento,
        ded_115_3_vale_refeicao: resultado.d115_3_valeRefeicao,
        total_bruto: resultado.totalBruto,
        total_dedu: resultado.totalDedu,
        liquido_rescisorio: resultado.liquidoRescisorio,
        // mantém compat com colunas antigas
        saldo_salario: resultado.v50_saldoDiasSalario,
        aviso_previo_valor: resultado.v69_avisoIndenizado,
        ferias_vencidas: resultado.v66_feriasVencidas,
        ferias_proporcionais: resultado.v65_feriasProporcionais,
        terco_ferias: resultado.v68_tercoFerias,
        decimo_terceiro: resultado.v63_13Proporcional,
        inss: resultado.d112_1_inss + resultado.d112_2_inss13,
        irrf: resultado.d114_1_irrf + resultado.d114_2_irrf13,
        fgts_mes: 0,
        multa_fgts: 0,
        outros_descontos: resultado.d100_pensao + resultado.d105_emprestimoConsig,
        total_proventos: resultado.totalBruto,
        total_descontos: resultado.totalDedu,
        liquido: resultado.liquidoRescisorio,
        observacoes,
        snapshot_json: { resultado, overrides } as any,
        status: 'finalizada',
        user_id: session.user.id,
        usuario_nome: session.user.email || '',
      };
      const { data, error } = await supabase.from('rescisoes').insert(payload).select('id').single();
      if (error) throw error;

      await registrarAcao({
        modulo: 'rh',
        entidade: 'rescisao',
        entidadeId: (data as any).id,
        acao: 'criou',
        depois: { liquido: resultado.liquidoRescisorio, total_bruto: resultado.totalBruto },
      });

      toast.success('Rescisão registrada (TRCT)');
      setOpen(false);
      setEmpId(''); setObservacoes(''); setOverrides({});
      await fetchList();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const imprimir = (r: any) => {
    const snap = (r.snapshot_json && (r.snapshot_json as any).resultado) || null;
    const resultado: TrctResultado = snap || {
      v50_saldoDiasSalario: Number(r.verba_50_saldo_dias || r.saldo_salario || 0),
      v51_comissoes: Number(r.verba_51_comissoes || 0),
      v52_gratificacao: Number(r.verba_52_gratificacao || 0),
      v53_insalubridade: Number(r.verba_53_insalubridade || 0),
      v54_periculosidade: Number(r.verba_54_periculosidade || 0),
      v55_adicNoturno: Number(r.verba_55_adic_noturno || 0),
      v56_horasExtras: Number(r.verba_56_horas_extras || 0),
      v57_gorjetas: Number(r.verba_57_gorjetas || 0),
      v58_dsr: Number(r.verba_58_dsr || 0),
      v59_reflexoDsr: Number(r.verba_59_reflexo_dsr || 0),
      v60_multa477: Number(r.verba_60_multa_477 || 0),
      v61_multa479: Number(r.verba_61_multa_479 || 0),
      v62_salarioFamilia: Number(r.verba_62_salario_familia || 0),
      v63_13Proporcional: Number(r.verba_63_13_proporcional || 0),
      v64_13Exercicio: Number(r.verba_64_13_exercicio || 0),
      v65_feriasProporcionais: Number(r.verba_65_ferias_proporcionais || 0),
      v66_feriasVencidas: Number(r.verba_66_ferias_vencidas || 0),
      v68_tercoFerias: Number(r.verba_68_terco_ferias || 0),
      v69_avisoIndenizado: Number(r.verba_69_aviso_indenizado || 0),
      v70_13SobreAviso: Number(r.verba_70_13_sobre_aviso || 0),
      v71_feriasSobreAviso: Number(r.verba_71_ferias_sobre_aviso || 0),
      d100_pensao: Number(r.ded_100_pensao || 0),
      d101_adiantamento: Number(r.ded_101_adiantamento || 0),
      d102_adiant13: Number(r.ded_102_adiant_13 || 0),
      d103_avisoIndenizado: Number(r.ded_103_aviso_indenizado || 0),
      d104_indenizacao480: Number(r.ded_104_indenizacao_480 || 0),
      d105_emprestimoConsig: Number(r.ded_105_emprestimo_consig || 0),
      d106_valeTransporte: Number(r.ded_106_vale_transporte || 0),
      d112_1_inss: Number(r.ded_112_1_inss || 0),
      d112_2_inss13: Number(r.ded_112_2_inss_13 || 0),
      d114_1_irrf: Number(r.ded_114_1_irrf || 0),
      d114_2_irrf13: Number(r.ded_114_2_irrf_13 || 0),
      d115_2_arredondamento: Number(r.ded_115_2_arredondamento || 0),
      d115_3_valeRefeicao: Number(r.ded_115_3_vale_refeicao || 0),
      diasAviso: Number(r.dias_aviso || 0),
      diasTrabalhadosMes: 0,
      mesesAvosFerias: 0,
      mesesAvos13: 0,
      totalBruto: Number(r.total_bruto || r.total_proventos || 0),
      totalDedu: Number(r.total_dedu || r.total_descontos || 0),
      liquidoRescisorio: Number(r.liquido_rescisorio || r.liquido || 0),
    };
    printDocumentInPage(buildTrctHtml({
      empresaNome: r.empresa_nome,
      empresaCnpj: r.empresa_cnpj,
      funcionarioNome: r.funcionario_nome,
      cpf: r.cpf,
      cargo: r.cargo,
      causa: (r.tipo_rescisao || 'sj_empregador') as CausaAfastamento,
      codigoAfastamento: r.codigo_afastamento,
      remuneracaoMesAnterior: Number(r.remuneracao_mes_anterior || r.salario_base || 0),
      dataAdmissao: r.data_admissao,
      dataAviso: r.data_aviso,
      dataAfastamento: r.data_desligamento,
      observacoes: r.observacoes,
      resultado,
    }));
  };

  // Edição inline de uma rubrica numérica
  const RubricaInput: React.FC<{ k: RubricaKey; label: string }> = ({ k, label }) => (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="w-28 border border-border bg-background rounded px-2 py-0.5 text-right text-xs"
        value={overrides[k] !== undefined ? overrides[k] as number : (baseResult ? Number(baseResult[k]) : 0)}
        onChange={e => {
          const v = Number(String(e.target.value).replace(',', '.')) || 0;
          setOverrides(prev => ({ ...prev, [k]: v }));
        }}
      />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><FileX className="w-6 h-6" /> Rescisões (TRCT)</h1>
          <p className="text-sm text-muted-foreground">Cálculo no padrão do Termo de Rescisão do Contrato de Trabalho.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Rescisão</Button></DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Rescisão — Padrão TRCT</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Funcionário</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name} — {e.cargo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {emp && (
                <div className="md:col-span-2 text-xs bg-muted p-2 rounded">
                  <strong>Empresa:</strong> {empresa?.name} · <strong>Admissão:</strong> {emp.dataAdmissao || '—'} · <strong>Salário base:</strong> {formatCurrency(emp.salarioBase)} · <strong>CPF:</strong> {emp.cpf}
                </div>
              )}
              <div>
                <Label>Data do aviso</Label>
                <Input type="date" value={dataAviso} onChange={e => setDataAviso(e.target.value)} />
              </div>
              <div>
                <Label>Data de afastamento</Label>
                <Input type="date" value={dataAfastamento} onChange={e => setDataAfastamento(e.target.value)} />
              </div>
              <div>
                <Label>Causa do afastamento</Label>
                <Select value={causa} onValueChange={v => setCausa(v as CausaAfastamento)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sj_empregador">Despedida sem justa causa pelo empregador (SJ2)</SelectItem>
                    <SelectItem value="pedido_demissao">Pedido de demissão (PD)</SelectItem>
                    <SelectItem value="acordo_484a">Acordo mútuo Art. 484-A (AM)</SelectItem>
                    <SelectItem value="justa_causa">Justa causa (JCE)</SelectItem>
                    <SelectItem value="termino_experiencia">Término de contrato de experiência (TC)</SelectItem>
                    <SelectItem value="rescisao_indireta">Rescisão indireta (RI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aviso prévio</Label>
                <Select value={avisoTrabalhado ? 't' : 'i'} onValueChange={v => setAvisoTrabalhado(v === 't')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="t">Trabalhado</SelectItem>
                    <SelectItem value="i">Indenizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dias de aviso</Label>
                <Input type="text" inputMode="numeric" value={diasAviso ?? ''} placeholder="auto" onChange={e => setDiasAviso(e.target.value ? Number(e.target.value) : undefined)} />
              </div>
              <div>
                <Label>Remuneração mês anterior (R$)</Label>
                <Input type="text" inputMode="decimal" value={remuneracao} onChange={e => setRemuneracao(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Insalubridade %</Label>
                <Input type="text" inputMode="numeric" value={insalPct} onChange={e => setInsalPct(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Base insalubridade (R$)</Label>
                <Input type="text" inputMode="decimal" value={insalBase} onChange={e => setInsalBase(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Comissões (R$)</Label>
                <Input type="text" inputMode="decimal" value={comissoes} onChange={e => setComissoes(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Horas extras valor (R$)</Label>
                <Input type="text" inputMode="decimal" value={horasExtras} onChange={e => setHorasExtras(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Meses férias vencidas</Label>
                <Input type="text" inputMode="numeric" value={feriasVencidasMeses} onChange={e => setFeriasVencidasMeses(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Adiantamento salarial (R$)</Label>
                <Input type="text" inputMode="decimal" value={adiantSal} onChange={e => setAdiantSal(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Vale-transporte desc. (R$)</Label>
                <Input type="text" inputMode="decimal" value={vt} onChange={e => setVt(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Vale-refeição desc. (R$)</Label>
                <Input type="text" inputMode="decimal" value={vr} onChange={e => setVr(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div>
                <Label>Arredondamento anterior (R$)</Label>
                <Input type="text" inputMode="decimal" value={arred} onChange={e => setArred(Number(String(e.target.value).replace(',', '.')) || 0)} />
              </div>
              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} />
              </div>

              {resultado && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted p-3 rounded">
                  <div>
                    <div className="font-bold text-sm mb-2">Verbas (edite se necessário)</div>
                    <RubricaInput k="v50_saldoDiasSalario" label={`50 — Saldo de salário (${resultado.diasTrabalhadosMes} dias)`} />
                    <RubricaInput k="v51_comissoes" label="51 — Comissões" />
                    <RubricaInput k="v52_gratificacao" label="52 — Gratificação" />
                    <RubricaInput k="v53_insalubridade" label="53 — Insalubridade" />
                    <RubricaInput k="v54_periculosidade" label="54 — Periculosidade" />
                    <RubricaInput k="v55_adicNoturno" label="55 — Adic. Noturno" />
                    <RubricaInput k="v56_horasExtras" label="56.1 — Horas Extras" />
                    <RubricaInput k="v57_gorjetas" label="57 — Gorjetas" />
                    <RubricaInput k="v58_dsr" label="58 — DSR" />
                    <RubricaInput k="v59_reflexoDsr" label="59 — Reflexo DSR" />
                    <RubricaInput k="v60_multa477" label="60 — Multa 477" />
                    <RubricaInput k="v61_multa479" label="61 — Multa 479" />
                    <RubricaInput k="v62_salarioFamilia" label="62 — Salário-Família" />
                    <RubricaInput k="v63_13Proporcional" label={`63 — 13º proporcional (${resultado.mesesAvos13}/12)`} />
                    <RubricaInput k="v64_13Exercicio" label="64.1 — 13º exercício" />
                    <RubricaInput k="v65_feriasProporcionais" label={`65 — Férias proporcionais (${resultado.mesesAvosFerias}/12)`} />
                    <RubricaInput k="v66_feriasVencidas" label="66.1 — Férias vencidas" />
                    <RubricaInput k="v68_tercoFerias" label="68 — 1/3 Férias" />
                    <RubricaInput k="v69_avisoIndenizado" label={`69 — Aviso Indenizado (${resultado.diasAviso}d)`} />
                    <RubricaInput k="v70_13SobreAviso" label="70 — 13º sobre Aviso" />
                    <RubricaInput k="v71_feriasSobreAviso" label="71 — Férias sobre Aviso" />
                    <div className="flex justify-between font-bold border-t pt-1 mt-2 text-sm">
                      <span>TOTAL BRUTO</span><span>{formatCurrency(resultado.totalBruto)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-sm mb-2">Deduções (edite se necessário)</div>
                    <RubricaInput k="d100_pensao" label="100 — Pensão" />
                    <RubricaInput k="d101_adiantamento" label="101 — Adiantamento" />
                    <RubricaInput k="d102_adiant13" label="102 — Adiant. 13º" />
                    <RubricaInput k="d103_avisoIndenizado" label="103 — Aviso indenizado" />
                    <RubricaInput k="d104_indenizacao480" label="104 — Indenização 480" />
                    <RubricaInput k="d105_emprestimoConsig" label="105 — Empréstimo consig" />
                    <RubricaInput k="d106_valeTransporte" label="106 — Vale-transporte" />
                    <RubricaInput k="d112_1_inss" label="112.1 — INSS" />
                    <RubricaInput k="d112_2_inss13" label="112.2 — INSS 13º" />
                    <RubricaInput k="d114_1_irrf" label="114.1 — IRRF" />
                    <RubricaInput k="d114_2_irrf13" label="114.2 — IRRF 13º" />
                    <RubricaInput k="d115_2_arredondamento" label="115.2 — Arredondamento" />
                    <RubricaInput k="d115_3_valeRefeicao" label="115.3 — Vale-refeição" />
                    <div className="flex justify-between font-bold border-t pt-1 mt-2 text-sm">
                      <span>TOTAL DEDUÇÕES</span><span>{formatCurrency(resultado.totalDedu)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2 text-success">
                      <span>LÍQUIDO</span><span>{formatCurrency(resultado.liquidoRescisorio)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={!emp || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar Rescisão
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Funcionário</th>
                <th className="p-2 text-left">Empresa</th>
                <th className="p-2 text-left">Afastamento</th>
                <th className="p-2 text-left">Causa</th>
                <th className="p-2 text-right">Líquido</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">{r.funcionario_nome}</td>
                  <td className="p-2">{r.empresa_nome}</td>
                  <td className="p-2">{r.data_desligamento}</td>
                  <td className="p-2">{r.causa_afastamento || r.tipo_rescisao}</td>
                  <td className="p-2 text-right font-bold text-success">{formatCurrency(Number(r.liquido_rescisorio || r.liquido || 0))}</td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => imprimir(r)}><Printer className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma rescisão registrada.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default RescisaoPage;
