/**
 * ConferenciaPontoPage — visão consolidada por funcionário/competência mostrando
 * cartões importados, atestados, divergências e status de conferência.
 *
 * Lê a tabela `cartoes_ponto` (persistida pelo upload em ImportacaoFechamentoPage)
 * e a tabela `atestados` para cruzar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, FileText, RefreshCw, AlertTriangle, Loader2, Wand2, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  cruzarCartaoComAtestados,
  type CartaoPonto,
  type AtestadoLite,
  type ResultadoCruzamento,
} from '@/lib/pontoFechamento';
import { gerarRelatorioDivergencias } from '@/lib/divergenciasReport';

interface CartaoRow {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  empresa_nome: string;
  competencia: string;
  arquivo_nome: string;
  arquivo_url: string;
  ocr_confianca: number;
  dias_json: CartaoPonto['dias'];
  status_conferencia: string;
  enviado_fechamento: boolean;
  conferido_em: string | null;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'conferido':
      return <Badge className="bg-success text-success-foreground">Conferido</Badge>;
    case 'divergente':
      return <Badge className="bg-warning text-warning-foreground">Divergente</Badge>;
    case 'justificado':
      return <Badge className="bg-primary text-primary-foreground">Justificado</Badge>;
    case 'ignorado':
      return <Badge variant="outline">Ignorado</Badge>;
    default:
      return <Badge variant="secondary">Pendente</Badge>;
  }
};

const ConferenciaPontoPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [empresa, setEmpresa] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [cartoes, setCartoes] = useState<CartaoRow[]>([]);
  const [atestados, setAtestados] = useState<AtestadoLite[]>([]);
  const [salvando, setSalvando] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const cQuery = (supabase.from('cartoes_ponto') as unknown as {
        select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: CartaoRow[] | null; error: { message: string } | null }> };
      }).select('*').eq('competencia', competencia);
      const [{ data: cData, error: cErr }, atRes] = await Promise.all([
        cQuery,
        supabase.from('atestados').select('funcionario_id, funcionario_nome, data_inicio, data_fim').eq('competencia', competencia),
      ]);
      if (cErr) throw new Error(cErr.message);
      const filtered = (cData || []).filter((r) => !empresa || r.empresa_nome === empresa);
      setCartoes(filtered);
      setAtestados(((atRes.data || []) as Array<{ funcionario_id: string | null; funcionario_nome: string; data_inicio: string | null; data_fim: string | null }>).map((a) => ({
        funcionario_id: a.funcionario_id || undefined,
        funcionario_nome: a.funcionario_nome,
        data_inicio: a.data_inicio || '',
        data_fim: a.data_fim || a.data_inicio || '',
      })));
    } catch (e) {
      toast.error('Erro ao carregar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [competencia, empresa]);

  // Cruza cada cartão com atestados e devolve resultados agregados por funcionário
  const resultados: ResultadoCruzamento[] = useMemo(() => {
    return cartoes.map((c) => {
      const emp = employees.find((e) => e.id === c.funcionario_id);
      const cargo = emp?.cargo || '';
      const ats = atestados.filter((a) =>
        (c.funcionario_id && a.funcionario_id === c.funcionario_id) ||
        a.funcionario_nome.toLowerCase().includes((c.funcionario_nome || '').toLowerCase().split(' ')[0]),
      );
      const cartaoPonto: CartaoPonto = {
        funcionario_nome: c.funcionario_nome,
        dias: c.dias_json || [],
        competencia: c.competencia,
      };
      const r = cruzarCartaoComAtestados(cartaoPonto, cargo, ats, competencia);
      r.funcionario_id = c.funcionario_id || undefined;
      return r;
    });
  }, [cartoes, atestados, employees, competencia]);

  const totais = useMemo(() => ({
    funcionarios: resultados.length,
    divergentes: resultados.filter((r) => r.statusConferencia === 'divergente').length,
    justificados: resultados.filter((r) => r.statusConferencia === 'justificado').length,
    pendentes: resultados.filter((r) => r.statusConferencia === 'pendente').length,
    ignorados: resultados.filter((r) => r.ignorado).length,
  }), [resultados]);

  const conferir = async (cartaoId: string) => {
    setSalvando(true);
    try {
      const { error } = await (supabase.from('cartoes_ponto') as unknown as {
        update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> };
      }).update({ status_conferencia: 'conferido', conferido_em: new Date().toISOString() }).eq('id', cartaoId);
      if (error) throw new Error(error.message);
      toast.success('Cartão marcado como conferido.');
      await fetchData();
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const baixarRelatorio = () => {
    if (!resultados.length) { toast.error('Sem dados para gerar relatório.'); return; }
    gerarRelatorioDivergencias({
      empresaNome: empresa || 'Todas as empresas',
      competencia,
      resultados,
    });
    toast.success('Relatório gerado.');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-primary" /> Conferência de Ponto e Atestados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada por funcionário. Verde = conferido, laranja = divergente, azul = justificado, cinza = pendente.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}
              className="border rounded-md h-10 px-3 text-sm bg-background min-w-[200px]">
              <option value="">Todas</option>
              {companies.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência</label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button onClick={baixarRelatorio} variant="secondary">
            <Download className="w-4 h-4 mr-2" /> Relatório de Divergências
          </Button>
          <Link to="/admin/importar-fechamento"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Wand2 className="w-4 h-4" /> Importar
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Funcionários</p><p className="text-2xl font-bold">{totais.funcionarios}</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Divergentes</p><p className="text-2xl font-bold text-warning">{totais.divergentes}</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Justificados</p><p className="text-2xl font-bold text-primary">{totais.justificados}</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Pendentes</p><p className="text-2xl font-bold">{totais.pendentes}</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Ignorados</p><p className="text-2xl font-bold text-muted-foreground">{totais.ignorados}</p></Card>
      </div>

      {/* Tabela */}
      <Card className="overflow-x-auto">
        {resultados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              Nenhum cartão importado nesta competência.{' '}
              <Link to="/admin/importar-fechamento" className="text-primary underline">
                Suba os cartões aqui
              </Link>.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Funcionário', 'Status', 'Faltas', 'Atestados', 'Atraso', 'HE 50%', 'HE 100%', 'Divergências', 'Arquivo', 'Ações'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultados.map((r, i) => {
                const cartao = cartoes[i];
                return (
                  <tr key={cartao?.id || i} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium text-xs">{r.funcionario_nome}</td>
                    <td className="px-3 py-2 text-xs">{statusBadge(r.statusConferencia)}</td>
                    <td className="px-3 py-2 text-xs text-destructive">{r.faltasDias || '—'}</td>
                    <td className="px-3 py-2 text-xs text-warning">{r.diasAtestado || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.atrasosMinutos > 0 ? `${r.atrasosMinutos}min` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-success">{r.he50Horas > 0 ? `${r.he50Horas}h` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-success">{r.he100Horas > 0 ? `${r.he100Horas}h` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px]">
                      {r.divergencias.length > 0
                        ? r.divergencias.slice(0, 2).join(' • ') + (r.divergencias.length > 2 ? ` (+${r.divergencias.length - 2})` : '')
                        : (r.motivoIgnorado || '—')}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {cartao?.arquivo_url ? (
                        <a href={cartao.arquivo_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 underline">
                          <FileText className="w-3 h-3" /> Abrir
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {cartao && cartao.status_conferencia !== 'conferido' && (
                        <Button size="sm" variant="outline" disabled={salvando} onClick={() => conferir(cartao.id)}>
                          Marcar conferido
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default ConferenciaPontoPage;
