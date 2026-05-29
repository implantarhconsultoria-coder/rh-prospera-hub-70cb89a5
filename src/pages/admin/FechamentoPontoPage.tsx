import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Lock, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee, MonthlyEntry } from '@/types/database';
import { isMechanicRole } from '@/lib/employeeRoleRules';
import {
  calcularResumoColaborador,
  formatarMinutos,
  getJornada,
  type RegistroPonto,
  type ResumoColaborador,
} from '@/lib/pontoCalc';

interface AcessoMecanico {
  id: string;
  nome: string;
  empresa: string | null;
  filial: string | null;
  funcao: string | null;
  funcionario_id: string | null;
  profile_user_id: string | null;
  cpf?: string | null;
  cpf_clean?: string | null;
  registro_teste?: boolean | null;
}

interface LinhaResumo extends ResumoColaborador {
  employeeId?: string;
  acessoId?: string;
  profileUserId?: string | null;
  nome: string;
  cargo: string;
  empresaNome: string;
  empresaId: string;
  entradaCount: number;
  almocoInicioCount: number;
  almocoFimCount: number;
  saidaCount: number;
  pendencias: string[];
}

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

const isMissingDbColumn = (error: any) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === '42703' || msg.includes('does not exist') || msg.includes('schema cache');
};

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const roundHours = (minutos: number) => Math.round((minutos / 60) * 100) / 100;

const isMecanico = (employee: Employee) => {
  const haystack = normalize([employee.cargo, employee.setorGhe, employee.observacoes].join(' '));
  return haystack.includes('mecan');
};

const contarTipos = (registros: RegistroPonto[], tipos: string[]) =>
  registros.filter((r) => tipos.includes(String(r.tipo))).length;

const buildObservacoesPonto = (linha: LinhaResumo, anterior?: string) => {
  const marcador = '[PONTO_MECANICOS]';
  const resumo =
    `${marcador} ${linha.diasTrabalhados} dia(s) trabalhado(s); ` +
    `${linha.faltas} falta(s); ${roundHours(linha.atrasoTotalMin)}h atraso; ` +
    `${roundHours(linha.horasExtrasMin)}h HE50; ${linha.inconsistencias} pendencia(s).`;
  const limpo = String(anterior || '').replace(/\n?\[PONTO_MECANICOS\][^\n]*/g, '').trim();
  return [limpo, resumo].filter(Boolean).join('\n');
};

const FechamentoPontoPage: React.FC = () => {
  const { companies, employees, entries, refreshEntries } = useApp();
  const [selectedCompany, setSelectedCompany] = useState<string>('todas');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [carregando, setCarregando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaResumo[]>([]);
  const [executado, setExecutado] = useState(false);

  const empresasMap = useMemo(() => {
    const m = new Map<string, { name: string; codigo: string; city: string }>();
    companies.forEach((c) => m.set(c.id, { name: c.name, codigo: c.codigo, city: c.city }));
    return m;
  }, [companies]);

  const employeeById = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const employeeByCpf = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => {
      const cpf = onlyDigits(e.cpf);
      if (cpf) m.set(cpf, e);
    });
    return m;
  }, [employees]);

  const resolveEmployee = useCallback((acesso: AcessoMecanico, candidatos: Employee[]) => {
    if (acesso.funcionario_id && employeeById.has(acesso.funcionario_id)) {
      return employeeById.get(acesso.funcionario_id);
    }

    const porCpf = employeeByCpf.get(onlyDigits(acesso.cpf_clean || acesso.cpf));
    if (porCpf) return porCpf;

    const nome = normalize(acesso.nome);
    return candidatos.find((e) => normalize(e.name) === nome || normalize(e.name).includes(nome));
  }, [employeeByCpf, employeeById]);

  const companyMatchesAccess = useCallback((acesso: AcessoMecanico, employee?: Employee) => {
    if (selectedCompany === 'todas') return true;
    if (employee) return employee.companyId === selectedCompany;

    const company = empresasMap.get(selectedCompany);
    if (!company) return false;

    const acessoText = normalize([acesso.empresa, acesso.filial].filter(Boolean).join(' '));
    if (!acessoText) return false;

    const alvos = [company.name, company.codigo, company.city].map(normalize).filter(Boolean);

    if (company.codigo === 'topac-matriz') alvos.push('matriz', 'sao paulo', 'sp');
    if (company.codigo === 'topac-pg') alvos.push('praia grande', 'pg');
    if (company.codigo === 'topac-gyn') alvos.push('goiania', 'goiania go', 'go');

    return alvos.some((alvo) => acessoText.includes(alvo) || alvo.includes(acessoText));
  }, [empresasMap, selectedCompany]);

  const montarResumos = useCallback(async () => {
    const [y, m] = competencia.split('-').map(Number);
    const ini = `${y}-${String(m).padStart(2, '0')}-01`;
    const fim = new Date(y, m, 0).toISOString().slice(0, 10);

    const empsAlvo = employees.filter(
      (e) =>
        e.status === 'ativo' &&
        (selectedCompany === 'todas' || e.companyId === selectedCompany),
    );

    const { data: acessos, error: acessosError } = await (supabase as any)
      .from('acessos_externos')
      .select('id,nome,empresa,filial,funcao,funcionario_id,profile_user_id,cpf,cpf_clean')
      .eq('modulo', 'mecanico')
      .in('perfil_acesso', ['mecanico_externo', 'mecanico_teste'])
      .eq('status', 'ativo')
      .eq('acesso_liberado', true)
      .order('nome');

    if (acessosError) throw acessosError;

    const acessosResolvidos = ((acessos || []) as AcessoMecanico[])
      .map((acesso) => ({ acesso, employee: resolveEmployee(acesso, empsAlvo) }))
      .filter(({ acesso, employee }) => companyMatchesAccess(acesso, employee));

    const mecanicosPorEmployee = new Set(
      acessosResolvidos
        .map(({ employee }) => employee?.id)
        .filter(Boolean) as string[],
    );

    const mecanicosFallback = empsAlvo
      .filter((e) => isMecanico(e) && !mecanicosPorEmployee.has(e.id))
      .map((employee) => ({ acesso: null as AcessoMecanico | null, employee }));

    const mecanicos = [...acessosResolvidos, ...mecanicosFallback];

    let pontosRes = await (supabase as any)
      .from('registros_ponto')
      .select('id,user_id,acesso_externo_id,tipo,data,hora,registro_teste,mecanico_nome,empresa,filial')
      .gte('data', ini)
      .lte('data', fim)
      .eq('registro_teste', false)
      .order('data', { ascending: true })
      .order('hora', { ascending: true });

    if (pontosRes.error && isMissingDbColumn(pontosRes.error)) {
      pontosRes = await (supabase as any)
        .from('registros_ponto')
        .select('id,user_id,tipo,data,hora')
        .gte('data', ini)
        .lte('data', fim)
        .order('data', { ascending: true })
        .order('hora', { ascending: true });
    }

    if (pontosRes.error) throw pontosRes.error;

    const todosRegistros = (pontosRes.data || []) as Array<RegistroPonto & {
      acesso_externo_id?: string | null;
      mecanico_nome?: string | null;
    }>;

    const resumos: LinhaResumo[] = mecanicos.map(({ acesso, employee }) => {
      const employeeId = employee?.id;
      const acessoId = acesso?.id;
      const profileUserId = acesso?.profile_user_id || null;
      const nome = employee?.name || acesso?.nome || 'Mecânico sem vínculo';
      const empresaId = employee?.companyId || '';
      const empresaInfo = empresaId ? empresasMap.get(empresaId) : null;

      const regs = todosRegistros
        .filter((r) =>
          (acessoId && r.acesso_externo_id === acessoId) ||
          (profileUserId && r.user_id === profileUserId) ||
          (acessoId && r.user_id === acessoId) ||
          (!!nome && normalize(r.mecanico_nome) === normalize(nome)),
        )
        .map((r) => ({ ...r, user_id: acessoId || profileUserId || employeeId || nome }));

      const jornada = getJornada(empresaInfo?.codigo);
      const resumo = calcularResumoColaborador(acessoId || profileUserId || employeeId || nome, regs, competencia, jornada);
      const pendencias: string[] = [];
      if (!employeeId) pendencias.push('sem vínculo com funcionário');
      if (resumo.faltas > 0) pendencias.push(`${resumo.faltas} falta(s)`);
      if (resumo.inconsistencias > 0) pendencias.push(`${resumo.inconsistencias} dia(s) inconsistente(s)`);
      if (resumo.horasFaltantesMin > 0) pendencias.push(`${formatarMinutos(resumo.horasFaltantesMin)} faltante`);

      return {
        ...resumo,
        employeeId,
        acessoId,
        profileUserId,
        nome,
        cargo: employee?.cargo || acesso?.funcao || '-',
        empresaNome: empresaInfo?.name || acesso?.empresa || '-',
        empresaId,
        entradaCount: contarTipos(regs, ['entrada']),
        almocoInicioCount: contarTipos(regs, ['almoco_inicio', 'almoco_saida']),
        almocoFimCount: contarTipos(regs, ['almoco_fim', 'almoco_volta']),
        saidaCount: contarTipos(regs, ['saida']),
        pendencias,
      };
    });

    resumos.sort((a, b) => {
      const e = a.empresaNome.localeCompare(b.empresaNome);
      return e !== 0 ? e : a.nome.localeCompare(b.nome);
    });

    return resumos;
  }, [competencia, companyMatchesAccess, employees, empresasMap, resolveEmployee, selectedCompany]);

  const persistirFechamento = useCallback(async (resumos: LinhaResumo[]) => {
    const linhasComVinculo = resumos.filter((l) => l.employeeId && l.empresaId);

    if (linhasComVinculo.length === 0) {
      toast.warning('Nenhum mecânico vinculado a funcionário para alimentar o fechamento geral.');
      return;
    }

    const payloads = linhasComVinculo.map((linha) => {
      const emp = employeeById.get(linha.employeeId!);
      const existente = entries.find(
        (entry) => entry.employeeId === linha.employeeId && entry.competencia === competencia,
      );

      const base: Partial<MonthlyEntry> = {
        adiantamento: existente?.adiantamento ?? (emp ? Math.round(emp.salarioBase * 0.4 * 100) / 100 : 0),
        vrAplicado: existente?.vrAplicado ?? emp?.vrAtivo ?? false,
        vrDias: existente?.vrDias ?? (emp?.vrAtivo ? 22 : 0),
        vaAplicado: existente?.vaAplicado ?? emp?.vaAtivo ?? false,
        vtAplicado: existente?.vtAplicado ?? emp?.vtAtivo ?? false,
        vtDesconto: existente?.vtDesconto ?? 0,
        insalubridadeAplicada: existente?.insalubridadeAplicada ?? isMechanicRole(emp?.cargo),
      };

      return {
        funcionario_id: linha.employeeId,
        company_id: linha.empresaId,
        competencia,
        faltas_dias: linha.faltas,
        atrasos: roundHours(linha.atrasoTotalMin),
        he50: roundHours(linha.horasExtrasMin),
        adiantamento: base.adiantamento,
        vr_aplicado: base.vrAplicado,
        vr_dias: base.vrDias,
        va_aplicado: base.vaAplicado,
        vt_aplicado: base.vtAplicado,
        vt_desconto: base.vtDesconto,
        insalubridade_aplicada: base.insalubridadeAplicada,
        status_conferencia: linha.inconsistencias > 0 ? 'divergente' : 'pendente',
        observacoes: buildObservacoesPonto(linha, existente?.observacoes),
        origem: 'consolidado',
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await (supabase as any)
      .from('lancamentos_mensais')
      .upsert(payloads, { onConflict: 'funcionario_id,competencia' });

    if (error) throw error;

    await refreshEntries();
    toast.success(`Fechamento dos mecânicos gravado no fechamento geral: ${payloads.length} funcionário(s).`);
  }, [competencia, employeeById, entries, refreshEntries]);

  const carregarMecanicos = useCallback(async (persistir = false, silencioso = false) => {
    setCarregando(true);
    try {
      const resumos = await montarResumos();
      setLinhas(resumos);
      setExecutado(true);

      if (persistir) {
        await persistirFechamento(resumos);
      } else if (!silencioso) {
        toast.success(`Mecânicos carregados: ${resumos.length}.`);
      }
    } catch (err: any) {
      toast.error('Erro no fechamento de ponto: ' + (err?.message || 'inesperado'));
      setLinhas([]);
      setExecutado(true);
    } finally {
      setCarregando(false);
    }
  }, [montarResumos, persistirFechamento]);

  useEffect(() => {
    if (!competencia || companies.length === 0) return;
    const timeout = window.setTimeout(() => {
      void carregarMecanicos(false, true);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [carregarMecanicos, companies.length, competencia, selectedCompany]);

  const totais = useMemo(() => {
    const t = {
      pessoas: linhas.length,
      diasTrab: 0,
      faltas: 0,
      atrasoMin: 0,
      heMin: 0,
      hfMin: 0,
      saldoMin: 0,
      inconsist: 0,
    };
    linhas.forEach((l) => {
      t.diasTrab += l.diasTrabalhados;
      t.faltas += l.faltas;
      t.atrasoMin += l.atrasoTotalMin;
      t.heMin += l.horasExtrasMin;
      t.hfMin += l.horasFaltantesMin;
      t.saldoMin += l.saldoMin;
      t.inconsist += l.inconsistencias + (l.employeeId ? 0 : 1);
    });
    return t;
  }, [linhas]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Ponto dos Mecânicos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione empresa e competência para listar automaticamente os mecânicos vinculados. O botão de fechamento grava faltas, atrasos e HE no fechamento geral.
          </p>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          >
            <option value="todas">Todas as empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <Input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          onClick={() => carregarMecanicos(true)}
          disabled={carregando || linhas.length === 0}
          className="gradient-primary text-primary-foreground"
        >
          {carregando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Lock className="w-4 h-4 mr-2" />
          )}
          {carregando ? 'Processando...' : 'FECHAR O MÊS'}
        </Button>
        {executado && (
          <Button onClick={() => carregarMecanicos(false)} variant="outline" size="icon" title="Recarregar">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </Card>

      {executado && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <Users className="w-3.5 h-3.5" /> Mecânicos
              </div>
              <p className="text-2xl font-bold font-display mt-1">{totais.pessoas}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" /> Dias Trabalhados
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-success">{totais.diasTrab}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <AlertTriangle className="w-3.5 h-3.5" /> Faltas
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-destructive">{totais.faltas}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <Clock className="w-3.5 h-3.5" /> Atrasos
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-warning">{formatarMinutos(totais.atrasoMin)}</p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Horas Extras</div>
              <p className="text-2xl font-bold font-display mt-1 text-success">{formatarMinutos(totais.heMin)}</p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Horas Faltantes</div>
              <p className="text-2xl font-bold font-display mt-1 text-destructive">{formatarMinutos(totais.hfMin)}</p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Saldo Geral</div>
              <p className={`text-2xl font-bold font-display mt-1 ${totais.saldoMin >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatarMinutos(totais.saldoMin)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Pendências</div>
              <p className="text-2xl font-bold font-display mt-1 text-warning">{totais.inconsist}</p>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {[
                    'Mecânico',
                    'Empresa',
                    'Cargo',
                    'Entrada',
                    'Início Almoço',
                    'Retorno Almoço',
                    'Saída',
                    'Faltas',
                    'Atraso',
                    'HE',
                    'Pendências',
                  ].map((h) => (
                    <th key={h} className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.employeeId || l.acessoId || l.nome}-${i}`} className="border-b hover:bg-muted/20">
                    <td className="px-2 py-2 font-medium whitespace-nowrap text-xs">{l.nome}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{l.empresaNome}</td>
                    <td className="px-2 py-2 text-xs">{l.cargo}</td>
                    <td className="px-2 py-2 text-xs">{l.entradaCount || '-'}</td>
                    <td className="px-2 py-2 text-xs">{l.almocoInicioCount || '-'}</td>
                    <td className="px-2 py-2 text-xs">{l.almocoFimCount || '-'}</td>
                    <td className="px-2 py-2 text-xs">{l.saidaCount || '-'}</td>
                    <td className="px-2 py-2 text-xs text-destructive">{l.faltas || '-'}</td>
                    <td className="px-2 py-2 text-xs">{l.atrasoTotalMin > 0 ? formatarMinutos(l.atrasoTotalMin) : '-'}</td>
                    <td className="px-2 py-2 text-xs text-success">{l.horasExtrasMin > 0 ? formatarMinutos(l.horasExtrasMin) : '-'}</td>
                    <td className="px-2 py-2 text-xs">
                      {l.pendencias.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {l.pendencias.slice(0, 3).map((p) => (
                            <Badge key={p} variant="outline" className="border-warning text-warning">{p}</Badge>
                          ))}
                        </div>
                      ) : (
                        <Badge variant="outline" className="border-success text-success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-2 py-8 text-center text-muted-foreground text-sm">
                      Nenhum mecânico vinculado encontrado para esta seleção.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <p className="text-xs text-muted-foreground italic">
            O fechamento grava automaticamente faltas, atrasos e HE 50% em lançamentos mensais, usando o mesmo fechamento geral dos funcionários.
          </p>
        </>
      )}

      {!executado && (
        <Card className="p-8 text-center text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Selecione a empresa e a competência para carregar os mecânicos automaticamente.</p>
        </Card>
      )}
    </div>
  );
};

export default FechamentoPontoPage;
