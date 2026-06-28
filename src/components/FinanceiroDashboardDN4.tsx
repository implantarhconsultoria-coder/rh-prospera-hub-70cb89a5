import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Download,
  Filter,
  Calendar,
  Building,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

interface FinanceiroDashboardDN4Props {
  empresaId?: string;
  filialId?: string;
}

interface KPI {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}

interface Titulo {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
  saldo: number;
  status: string;
  data_vencimento: string;
  tipo: 'receber' | 'pagar';
}

const FinanceiroDashboardDN4: React.FC<FinanceiroDashboardDN4Props> = () => {
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [selectedPeriodo, setSelectedPeriodo] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [kpis, setKpis] = useState<KPI[]>([]);

  const applyEmp = (q: any) => {
    const safeIds = ext.empresaIds !== null
      ? ext.empresaIds.length
        ? ext.empresaIds
        : ['00000000-0000-0000-0000-000000000000']
      : null;
    return safeIds ? q.in('empresa_id', safeIds) : q;
  };

  const carregar = async () => {
    setLoading(true);
    try {
      const [receber, pagar, emps, contas_bancarias] = await Promise.all([
        applyEmp(
          supabase
            .from('titulos_receber')
            .select('id, numero, descricao, valor_original, saldo, status, data_vencimento')
            .order('data_vencimento', { ascending: false })
        ),
        applyEmp(
          supabase
            .from('titulos_pagar')
            .select('id, numero, descricao, valor_previsto, saldo, status, data_vencimento')
            .order('data_vencimento', { ascending: false })
        ),
        ext.empresaIds !== null
          ? ext.empresaIds.length
            ? supabase
                .from('empresas')
                .select('id, nome')
                .in('id', ext.empresaIds)
            : supabase
                .from('empresas')
                .select('id, nome')
                .eq('id', '00000000-0000-0000-0000-000000000000')
          : supabase.from('empresas').select('id, nome'),
        applyEmp(
          supabase
            .from('contas_bancarias')
            .select('id, nome, saldo_atual, banco')
            .eq('status', 'ativa')
        ),
      ]);

      const titulosReceber = (receber.data || []).map((t: any) => ({
        id: t.id,
        numero: t.numero,
        descricao: t.descricao || 'Título a receber',
        valor: t.valor_original || 0,
        saldo: t.saldo || 0,
        status: t.status,
        data_vencimento: t.data_vencimento,
        tipo: 'receber' as const,
      }));

      const titulosPagar = (pagar.data || []).map((t: any) => ({
        id: t.id,
        numero: t.numero,
        descricao: t.descricao || 'Título a pagar',
        valor: t.valor_previsto || 0,
        saldo: t.saldo || 0,
        status: t.status,
        data_vencimento: t.data_vencimento,
        tipo: 'pagar' as const,
      }));

      setTitulos([...titulosReceber, ...titulosPagar]);
      setEmpresas(emps.data || []);
      setContas(contas_bancarias.data || []);

      if (!selectedEmpresa && emps.data?.length) {
        setSelectedEmpresa(emps.data[0].id);
      }

      // Calcular KPIs
      const totalReceber = titulosReceber.reduce((sum, t) => sum + t.valor, 0);
      const totalPagar = titulosPagar.reduce((sum, t) => sum + t.valor, 0);
      const saldoReceber = titulosReceber.reduce((sum, t) => sum + t.saldo, 0);
      const saldoPagar = titulosPagar.reduce((sum, t) => sum + t.saldo, 0);
      const saldoContas = contas_bancarias.data?.reduce((sum: number, c: any) => sum + (c.saldo_atual || 0), 0) || 0;
      const resultado = totalReceber - totalPagar;

      const kpisData: KPI[] = [
        {
          label: 'Receitas',
          value: `R$ ${totalReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <TrendingUp className="w-5 h-5" />,
          color: 'text-green-500',
        },
        {
          label: 'Despesas',
          value: `R$ ${totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <TrendingDown className="w-5 h-5" />,
          color: 'text-red-500',
        },
        {
          label: 'Pendente Receber',
          value: `R$ ${saldoReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <Clock className="w-5 h-5" />,
          color: 'text-yellow-500',
        },
        {
          label: 'Saldo em Contas',
          value: `R$ ${saldoContas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <Wallet className="w-5 h-5" />,
          color: 'text-blue-500',
        },
      ];

      setKpis(kpisData);
    } catch (error) {
      console.error('Erro ao carregar financeiro:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ext.loading) {
      carregar();
    }
  }, [ext.loading, ext.empresaIds]);

  const titulosFiltratosPorPeriodo = useMemo(() => {
    return titulos.filter((t) => {
      const competencia = t.data_vencimento?.slice(0, 7);
      return competencia === selectedPeriodo;
    });
  }, [titulos, selectedPeriodo]);

  const exportarPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 15;

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('RELATÓRIO FINANCEIRO', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      doc.setFontSize(10);
      doc.text(`Período: ${selectedPeriodo}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, yPosition, {
        align: 'center',
      });
      yPosition += 10;

      // KPIs
      doc.setFontSize(11);
      doc.text('RESUMO FINANCEIRO', 15, yPosition);
      yPosition += 7;

      doc.setFontSize(9);
      const kpiTexts = kpis.map((kpi) => `${kpi.label}: ${kpi.value}`);
      kpiTexts.forEach((text) => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 15;
        }
        doc.text(text, 15, yPosition);
        yPosition += 6;
      });

      yPosition += 5;

      // Tabela de títulos
      doc.setFontSize(11);
      doc.text('TÍTULOS DO PERÍODO', 15, yPosition);
      yPosition += 7;

      // Cabeçalho da tabela
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('Tipo', 15, yPosition);
      doc.text('Nº Título', 35, yPosition);
      doc.text('Descrição', 60, yPosition);
      doc.text('Valor', 130, yPosition);
      doc.text('Saldo', 150, yPosition);
      doc.text('Status', 170, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      doc.setDrawColor(200);
      doc.line(15, yPosition - 1, pageWidth - 15, yPosition - 1);

      // Dados da tabela
      titulosFiltratosPorPeriodo.forEach((titulo) => {
        if (yPosition > pageHeight - 15) {
          doc.addPage();
          yPosition = 15;
        }

        doc.text(titulo.tipo === 'receber' ? 'Receber' : 'Pagar', 15, yPosition);
        doc.text(titulo.numero, 35, yPosition);
        doc.text(titulo.descricao.substring(0, 20), 60, yPosition);
        doc.text(
          `R$ ${titulo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          130,
          yPosition,
          { align: 'right' }
        );
        doc.text(
          `R$ ${titulo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          150,
          yPosition,
          { align: 'right' }
        );
        doc.text(titulo.status, 170, yPosition);
        yPosition += 6;
      });

      doc.save(`financeiro_${selectedPeriodo}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Wallet className="w-8 h-8 text-primary" />
            Dashboard Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Receitas, despesas, contas e fluxo de caixa
          </p>
        </div>
        <button
          onClick={exportarPDF}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
        >
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card rounded-lg border border-border">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Building className="w-4 h-4" />
            Empresa
          </label>
          <select
            value={selectedEmpresa}
            onChange={(e) => setSelectedEmpresa(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="">Todas as empresas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Calendar className="w-4 h-4" />
            Período
          </label>
          <input
            type="month"
            value={selectedPeriodo}
            onChange={(e) => setSelectedPeriodo(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">{kpi.label}</p>
                <p className={`text-xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <div className={`${kpi.color} opacity-20`}>{kpi.icon}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Contas Bancárias */}
      {contas.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Contas Bancárias
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {contas.map((conta) => (
              <div key={conta.id} className="p-3 bg-muted/30 rounded-lg border border-border/50">
                <p className="text-xs text-muted-foreground font-medium">{conta.banco}</p>
                <p className="text-sm font-semibold mt-1">{conta.nome}</p>
                <p className="text-lg font-bold text-primary mt-2">
                  R$ {conta.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de Títulos */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Títulos do Período ({titulosFiltratosPorPeriodo.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Nº Título</th>
                <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {titulosFiltratosPorPeriodo.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum título encontrado para este período.
                  </td>
                </tr>
              ) : (
                titulosFiltratosPorPeriodo.map((titulo) => (
                  <tr key={titulo.id} className="border-t border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          titulo.tipo === 'receber'
                            ? 'bg-green-500/20 text-green-700'
                            : 'bg-red-500/20 text-red-700'
                        }`}
                      >
                        {titulo.tipo === 'receber' ? 'Receber' : 'Pagar'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{titulo.numero}</td>
                    <td className="px-4 py-3">{titulo.descricao}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      R$ {titulo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      R$ {titulo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          titulo.status === 'pago' || titulo.status === 'quitado'
                            ? 'bg-green-500/20 text-green-700'
                            : titulo.status === 'vencido' || titulo.status === 'vencida'
                              ? 'bg-red-500/20 text-red-700'
                              : 'bg-yellow-500/20 text-yellow-700'
                        }`}
                      >
                        {titulo.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinanceiroDashboardDN4;
