import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Lock, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  calcularResumoColaborador,
  formatarMinutos,
  getJornada,
  type RegistroPonto,
  type ResumoColaborador,
} from '@/lib/pontoCalc';

interface LinhaResumo extends ResumoColaborador {
  nome: string;
  cargo: string;
  empresaNome: string;
  empresaId: string;
}

const FechamentoPontoPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [selectedCompany, setSelectedCompany] = useState<string>('todas');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [filtroNome, setFiltroNome] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaResumo[]>([]);
  const [executado, setExecutado] = useState(false);

  const empresasMap = useMemo(() => {
    const m = new Map<string, { name: string; codigo: string }>();
    companies.forEach((c) => m.set(c.id, { name: c.name, codigo: c.codigo }));
    return m;
  }, [companies]);

  const fecharMes = async () => {
    setCarregando(true);
    setExecutado(false);
    try {
      // 1. Selecionar funcionários relevantes (apenas operacional + ativo)
      const empsAlvo = employees.filter(
        (e) =>
          e.status === 'ativo' &&
          (selectedCompany === 'todas' || e.companyId === selectedCompany),
      );

      if (empsAlvo.length === 0) {
        toast.error('Nenhum funcionário ativo encontrado para esta seleção.');
        setLinhas([]);
        setExecutado(true);
        return;
      }

      // 2. Buscar TODOS os registros de ponto da competência (uma única query)
      const [y, m] = competencia.split('-').map(Number);
      const ini = `${y}-${String(m).padStart(2, '0')}-01`;
      const fim = new Date(y, m, 0).toISOString().slice(0, 10);

      const { data: pontos, error } = await (supabase as any)
        .from('registros_ponto')
        .select('id, user_id, tipo, data, hora')
        .gte('data', ini)
        .lte('data', fim)
        .order('data', { ascending: true })
        .order('hora', { ascending: true });

      if (error) {
        toast.error('Erro ao ler registros de ponto: ' + error.message);
        return;
      }

      // 3. Para cada funcionário, calcular resumo
      // Como employees tem id (do funcionario) e o ponto usa user_id (auth user),
      // precisamos buscar o vínculo. Aqui usamos o email/cpf para tentar mapear.
      // Como fallback, este fechamento mostra TODOS os user_ids que registraram
      // ponto, e tentamos casar pelo nome via colaborador_veiculo + funcionarios.

      const todosRegistros = (pontos || []) as RegistroPonto[];
      const userIdsComPonto = Array.from(new Set(todosRegistros.map((r) => r.user_id)));

      // Buscar perfis dos user_ids com ponto pra ter nome
      const { data: perfis } = await (supabase as any)
        .from('profiles')
        .select('user_id, nome_completo, email')
        .in('user_id', userIdsComPonto);

      const perfilPorUser = new Map<string, { nome: string; email: string }>();
      (perfis || []).forEach((p: any) => {
        perfilPorUser.set(p.user_id, {
          nome: p.nome_completo || p.email || 'Sem nome',
          email: p.email || '',
        });
      });

      const resumos: LinhaResumo[] = [];

      for (const userId of userIdsComPonto) {
        const regs = todosRegistros.filter((r) => r.user_id === userId);
        const perfil = perfilPorUser.get(userId);

        // Tentar casar com employee pelo email
        const emp = empsAlvo.find(
          (e) => perfil?.email && e.email.toLowerCase() === perfil.email.toLowerCase(),
        );

        if (selectedCompany !== 'todas' && !emp) continue;
        if (!emp && empsAlvo.length > 0 && !empsAlvo.some((e) => e.email)) {
          // sem matching, ignora
        }

        const empresaInfo = emp ? empresasMap.get(emp.companyId) : null;
        const jornada = getJornada(empresaInfo?.codigo);
        const resumo = calcularResumoColaborador(userId, regs, competencia, jornada);

        resumos.push({
          ...resumo,
          nome: emp?.name || perfil?.nome || 'Colaborador desconhecido',
          cargo: emp?.cargo || '—',
          empresaNome: empresaInfo?.name || '—',
          empresaId: emp?.companyId || '',
        });
      }

      // Adicionar funcionários SEM nenhum ponto registrado (faltas integrais)
      for (const emp of empsAlvo) {
        const jaTem = resumos.some(
          (r) => r.nome.toLowerCase() === emp.name.toLowerCase(),
        );
        if (jaTem) continue;
        const empresaInfo = empresasMap.get(emp.companyId);
        const jornada = getJornada(empresaInfo?.codigo);
        const resumo = calcularResumoColaborador('', [], competencia, jornada);
        resumos.push({
          ...resumo,
          nome: emp.name,
          cargo: emp.cargo,
          empresaNome: empresaInfo?.name || '—',
          empresaId: emp.companyId,
        });
      }

      resumos.sort((a, b) => {
        const e = a.empresaNome.localeCompare(b.empresaNome);
        return e !== 0 ? e : a.nome.localeCompare(b.nome);
      });

      setLinhas(resumos);
      setExecutado(true);
      toast.success(`Fechamento calculado: ${resumos.length} colaboradores.`);
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'inesperado'));
    } finally {
      setCarregando(false);
    }
  };

  const linhasFiltradas = useMemo(() => {
    if (!filtroNome.trim()) return linhas;
    const q = filtroNome.toLowerCase();
    return linhas.filter(
      (l) => l.nome.toLowerCase().includes(q) || l.cargo.toLowerCase().includes(q),
    );
  }, [linhas, filtroNome]);

  const totais = useMemo(() => {
    const t = {
      pessoas: linhasFiltradas.length,
      diasTrab: 0,
      faltas: 0,
      atrasoMin: 0,
      heMin: 0,
      hfMin: 0,
      saldoMin: 0,
      inconsist: 0,
    };
    linhasFiltradas.forEach((l) => {
      t.diasTrab += l.diasTrabalhados;
      t.faltas += l.faltas;
      t.atrasoMin += l.atrasoTotalMin;
      t.heMin += l.horasExtrasMin;
      t.hfMin += l.horasFaltantesMin;
      t.saldoMin += l.saldoMin;
      t.inconsist += l.inconsistencias;
    });
    return t;
  }, [linhasFiltradas]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Fechamento por Ponto</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cálculo baseado <strong>somente</strong> nos registros de ponto. Não considera
            abastecimento, galões, chamados, KM, estoque, ASO, férias ou outros módulos.
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
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground block mb-1">Filtrar colaborador</label>
          <Input
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            placeholder="Nome ou cargo..."
          />
        </div>
        <Button
          onClick={fecharMes}
          disabled={carregando}
          className="gradient-primary text-primary-foreground"
        >
          {carregando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Lock className="w-4 h-4 mr-2" />
          )}
          {carregando ? 'Calculando...' : 'FECHAR O MÊS'}
        </Button>
        {executado && (
          <Button onClick={fecharMes} variant="outline" size="icon" title="Recalcular">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </Card>

      {executado && (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <Users className="w-3.5 h-3.5" /> Colaboradores
              </div>
              <p className="text-2xl font-bold font-display mt-1">{totais.pessoas}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" /> Dias Trabalhados
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-success">
                {totais.diasTrab}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <AlertTriangle className="w-3.5 h-3.5" /> Faltas
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-destructive">
                {totais.faltas}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
                <Clock className="w-3.5 h-3.5" /> Atrasos
              </div>
              <p className="text-2xl font-bold font-display mt-1 text-warning">
                {formatarMinutos(totais.atrasoMin)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Horas Extras</div>
              <p className="text-2xl font-bold font-display mt-1 text-success">
                {formatarMinutos(totais.heMin)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Horas Faltantes</div>
              <p className="text-2xl font-bold font-display mt-1 text-destructive">
                {formatarMinutos(totais.hfMin)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Saldo Geral</div>
              <p
                className={`text-2xl font-bold font-display mt-1 ${
                  totais.saldoMin >= 0 ? 'text-success' : 'text-destructive'
                }`}
              >
                {formatarMinutos(totais.saldoMin)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Inconsistências</div>
              <p className="text-2xl font-bold font-display mt-1 text-warning">
                {totais.inconsist}
              </p>
            </Card>
          </div>

          {/* Tabela consolidada */}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {[
                    'Colaborador',
                    'Empresa',
                    'Cargo',
                    'Dias Úteis',
                    'Trab.',
                    'Faltas',
                    'Atraso',
                    'HE',
                    'H. Faltantes',
                    'Cumprida',
                    'Esperada',
                    'Saldo',
                    'Inc.',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((l, i) => (
                  <tr key={`${l.userId}-${i}`} className="border-b hover:bg-muted/20">
                    <td className="px-2 py-2 font-medium whitespace-nowrap text-xs">{l.nome}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{l.empresaNome}</td>
                    <td className="px-2 py-2 text-xs">{l.cargo}</td>
                    <td className="px-2 py-2 text-xs">{l.diasUteis}</td>
                    <td className="px-2 py-2 text-xs text-success">{l.diasTrabalhados}</td>
                    <td className="px-2 py-2 text-xs text-destructive">{l.faltas || '—'}</td>
                    <td className="px-2 py-2 text-xs">
                      {l.atrasoTotalMin > 0 ? formatarMinutos(l.atrasoTotalMin) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-success">
                      {l.horasExtrasMin > 0 ? formatarMinutos(l.horasExtrasMin) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-destructive">
                      {l.horasFaltantesMin > 0 ? formatarMinutos(l.horasFaltantesMin) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs">{formatarMinutos(l.jornadaCumpridaMin)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {formatarMinutos(l.jornadaEsperadaMin)}
                    </td>
                    <td
                      className={`px-2 py-2 text-xs font-bold ${
                        l.saldoMin >= 0 ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {formatarMinutos(l.saldoMin)}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {l.inconsistencias > 0 ? (
                        <Badge variant="outline" className="border-warning text-warning">
                          {l.inconsistencias}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-2 py-8 text-center text-muted-foreground text-sm">
                      Nenhum colaborador para esta seleção.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <p className="text-xs text-muted-foreground italic">
            Esta visão é exclusivamente para conferência manual. Nenhum dado é gravado
            automaticamente — você continua fechando manualmente.
          </p>
        </>
      )}

      {!executado && (
        <Card className="p-8 text-center text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            Selecione a empresa e a competência, depois clique em <strong>FECHAR O MÊS</strong>{' '}
            para gerar o pente-fino do ponto.
          </p>
        </Card>
      )}
    </div>
  );
};

export default FechamentoPontoPage;
