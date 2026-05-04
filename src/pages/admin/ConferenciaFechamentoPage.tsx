import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, FileCheck, RefreshCw, Search, Clock, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/calculations';

type Func = {
  lancamento_id: string; funcionario_id: string; nome: string; cargo: string;
  salario_base: number;
  he50_horas: number; he50_valor: number;
  he100_horas: number; he100_valor: number;
  dsr: number; adicionais: number; insalubridade: number; comissao: number;
  faltas_dias: number; faltas_valor: number;
  atrasos_horas: number; atrasos_valor: number;
  descontos_diversos: number; adiantamento: number;
  inss: number; irrf: number;
  vt_desconto_6: number; vt_desconto_extra: number;
  vr: number; va: number; vt: number;
  proventos: number; descontos: number; liquido: number;
};

type Breakdown = {
  ok: boolean; dias_mes: number; dias_uteis: number;
  totais: { proventos: number; descontos: number; liquido: number; beneficios: number };
  funcionarios: Func[];
};

type HistoricoRow = {
  id: string; campo: string; valor_anterior: string | null; valor_novo: string | null;
  user_id: string | null; usuario_nome: string | null; created_at: string;
};

const CAMPO_LABEL: Record<string, string> = {
  faltas_dias: 'Faltas (dias)', atrasos: 'Atrasos (horas)',
  he50: 'HE 50% (horas)', he100: 'HE 100% (horas)',
  adicionais: 'Adicionais', descontos_diversos: 'Descontos diversos',
  adiantamento: 'Adiantamento',
};

const ConferenciaFechamentoPage: React.FC = () => {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const [search] = useSearchParams();
  const competencia = search.get('comp') || new Date().toISOString().slice(0, 7);
  const navigate = useNavigate();

  const [empresa, setEmpresa] = useState<string>('');
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [histLanc, setHistLanc] = useState<{ id: string; nome: string } | null>(null);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: emp }, { data: bd, error }] = await Promise.all([
      supabase.from('empresas').select('nome').eq('id', companyId).maybeSingle(),
      supabase.rpc('fechamento_filial_breakdown', { p_company_id: companyId, p_competencia: competencia }),
    ]);
    if (emp?.nome) setEmpresa(emp.nome);
    if (error) toast.error(error.message);
    else setData(bd as unknown as Breakdown);
    setLoading(false);
  };

  useEffect(() => { if (companyId) carregar(); /* eslint-disable-next-line */ }, [companyId, competencia]);

  const recalcular = async () => {
    setLoading(true);
    const { error } = await supabase.rpc('fechamento_filial_sincronizar', {
      p_company_id: companyId, p_competencia: competencia,
    });
    if (error) toast.error(error.message);
    else toast.success('Totais recalculados');
    await carregar();
  };

  const abrirHistorico = async (lancamentoId: string, nome: string) => {
    setHistLanc({ id: lancamentoId, nome });
    const { data: h, error } = await supabase
      .from('lancamentos_historico')
      .select('id,campo,valor_anterior,valor_novo,user_id,usuario_nome,created_at')
      .eq('lancamento_id', lancamentoId)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setHistorico((h as HistoricoRow[]) || []);
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || !data) return data?.funcionarios || [];
    return data.funcionarios.filter(f =>
      f.nome.toLowerCase().includes(q) || (f.cargo || '').toLowerCase().includes(q));
  }, [data, busca]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/fechamentos-filiais')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2 mt-1">
            <FileCheck className="w-6 h-6 text-primary" /> Conferência · {empresa}
          </h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · Detalhamento contábil por funcionário
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar funcionário…" className="pl-8 w-56" />
          </div>
          <Button variant="default" size="sm" onClick={recalcular} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Recalcular
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase">Proventos</p>
            <p className="text-lg font-bold text-success font-display">{formatCurrency(data.totais.proventos)}</p>
          </div>
          <div className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase">Descontos</p>
            <p className="text-lg font-bold text-destructive font-display">{formatCurrency(data.totais.descontos)}</p>
          </div>
          <div className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase">Líquido</p>
            <p className="text-lg font-bold text-accent font-display">{formatCurrency(data.totais.liquido)}</p>
          </div>
          <div className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase">Benefícios</p>
            <p className="text-lg font-bold text-primary font-display">{formatCurrency(data.totais.beneficios)}</p>
          </div>
        </div>
      )}

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {['Funcionário', 'Salário', 'HE 50%', 'HE 100%', 'DSR', 'Adic.', 'Insal.',
                'Faltas', 'Atrasos', 'Outros desc.', 'Adiant.', 'INSS', 'IRRF', 'VT 6%',
                'VR', 'VA', 'VT', 'Proventos', 'Descontos', 'Líquido', ''].map(h => (
                <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(f => (
              <tr key={f.lancamento_id} className="border-b hover:bg-muted/20">
                <td className="px-2 py-2 font-medium whitespace-nowrap">
                  {f.nome}
                  <div className="text-[10px] text-muted-foreground">{f.cargo}</div>
                </td>
                <td className="px-2 py-2">{formatCurrency(f.salario_base)}</td>
                <td className="px-2 py-2">{f.he50_horas > 0 ? <><span className="text-muted-foreground">{f.he50_horas}h</span> · {formatCurrency(f.he50_valor)}</> : '—'}</td>
                <td className="px-2 py-2">{f.he100_horas > 0 ? <><span className="text-muted-foreground">{f.he100_horas}h</span> · {formatCurrency(f.he100_valor)}</> : '—'}</td>
                <td className="px-2 py-2">{f.dsr > 0 ? formatCurrency(f.dsr) : '—'}</td>
                <td className="px-2 py-2">{f.adicionais > 0 ? formatCurrency(f.adicionais) : '—'}</td>
                <td className="px-2 py-2">{f.insalubridade > 0 ? formatCurrency(f.insalubridade) : '—'}</td>
                <td className="px-2 py-2 text-destructive">{f.faltas_dias > 0 ? <><span className="text-muted-foreground">{f.faltas_dias}d</span> · {formatCurrency(f.faltas_valor)}</> : '—'}</td>
                <td className="px-2 py-2 text-destructive">{f.atrasos_horas > 0 ? <><span className="text-muted-foreground">{f.atrasos_horas}h</span> · {formatCurrency(f.atrasos_valor)}</> : '—'}</td>
                <td className="px-2 py-2 text-destructive">{f.descontos_diversos > 0 ? formatCurrency(f.descontos_diversos) : '—'}</td>
                <td className="px-2 py-2 text-destructive">{f.adiantamento > 0 ? formatCurrency(f.adiantamento) : '—'}</td>
                <td className="px-2 py-2 text-destructive">{formatCurrency(f.inss)}</td>
                <td className="px-2 py-2 text-destructive">{f.irrf > 0 ? formatCurrency(f.irrf) : '—'}</td>
                <td className="px-2 py-2 text-destructive">{f.vt_desconto_6 > 0 ? formatCurrency(f.vt_desconto_6) : '—'}</td>
                <td className="px-2 py-2">{f.vr > 0 ? formatCurrency(f.vr) : '—'}</td>
                <td className="px-2 py-2">{f.va > 0 ? formatCurrency(f.va) : '—'}</td>
                <td className="px-2 py-2">{f.vt > 0 ? formatCurrency(f.vt) : '—'}</td>
                <td className="px-2 py-2 font-semibold text-success">{formatCurrency(f.proventos)}</td>
                <td className="px-2 py-2 font-semibold text-destructive">{formatCurrency(f.descontos)}</td>
                <td className="px-2 py-2 font-bold">{formatCurrency(f.liquido)}</td>
                <td className="px-2 py-2">
                  <Button variant="ghost" size="sm" title="Histórico" onClick={() => abrirHistorico(f.lancamento_id, f.nome)}>
                    <History className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && !loading && (
              <tr><td colSpan={21} className="px-3 py-8 text-center text-muted-foreground">Sem lançamentos para esta competência.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={!!histLanc} onOpenChange={open => !open && setHistLanc(null)}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Clock className="w-4 h-4" /> Histórico — {histLanc?.nome}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {historico.length === 0 && <p className="text-sm text-muted-foreground">Sem alterações registradas.</p>}
            {historico.map(h => (
              <div key={h.id} className="border rounded-md p-3 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge variant="outline">{CAMPO_LABEL[h.campo] || h.campo}</Badge>
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="line-through text-destructive">{h.valor_anterior ?? '—'}</span>
                  <span>→</span>
                  <span className="font-semibold text-success">{h.valor_novo ?? '—'}</span>
                </div>
                <div className="text-muted-foreground mt-1">por {h.usuario_nome || 'sistema'}</div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ConferenciaFechamentoPage;
