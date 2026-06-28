import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Filter,
  Calendar,
  Building,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

interface FaturamentoDashboardDN4Props {
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

interface Fatura {
  id: string;
  numero: string;
  cliente_nome: string;
  total: number;
  valor_pago: number;
  status: string;
  data_vencimento: string;
  competencia: string;
}

const FaturamentoDashboardDN4: React.FC<FaturamentoDashboardDN4Props> = () => {
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
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
      const [faturas, emps] = await Promise.all([
        applyEmp(
          supabase
            .from('faturas')
            .select(
              'id, numero, cliente_id, total, valor_pago, status, data_vencimento, competencia, clientes_fat(razao_social), empresas(nome)'
            )
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
      ]);

      const faturasList = (faturas.data || []).map((f: any) => ({
        id: f.id,
        numero: f.numero,
        cliente_nome: f.clientes_fat?.razao_social || 'Cliente desconhecido',
        total: f.total || 0,
        valor_pago: f.valor_pago || 0,
        status: f.status,
        data_vencimento: f.data_vencimento,
        competencia: f.competencia,
      }));

      setFaturas(faturasList);
      setEmpresas(emps.data || []);

      if (!selectedEmpresa && emps.data?.length) {
        setSelectedEmpresa(emps.data[0].id);
      }

      // Calcular KPIs
      const totalFaturado = faturasList.reduce((sum, f) => sum + f.total, 0);
      const totalRecebido = faturasList.reduce((sum, f) => sum + f.valor_pago, 0);
      const totalPendente = totalFaturado - totalRecebido;
      const totalAtrasado = faturasList
        .filter((f) => f.status === 'vencida')
        .reduce((sum, f) => sum + (f.total - f.valor_pago), 0);

      const kpisData: KPI[] = [
        {
          label: 'Total Faturado',
          value: `R$ ${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <DollarSign className="w-5 h-5" />,
          color: 'text-blue-500',
        },
        {
          label: 'Total Recebido',
          value: `R$ ${totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <CheckCircle2 className="w-5 h-5" />,
          color: 'text-green-500',
        },
        {
          label: 'Total Pendente',
          value: `R$ ${totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <Clock className="w-5 h-5" />,
          color: 'text-yellow-500',
        },
        {
          label: 'Total Atrasado',
          value: `R$ ${totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          icon: <AlertCircle className="w-5 h-5" />,
          color: 'text-red-500',
        },
      ];

      setKpis(kpisData);
    } catch (error) {
      console.error('Erro ao carregar faturamento:', error);
      toast.error('Erro ao carregar dados de faturamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ext.loading) {
      carregar();
    }
  }, [ext.loading, ext.empresaIds]);

  const faturasFiltradasPorPeriodo = useMemo(() => {
    return faturas.filter((f) => f.competencia === selectedPeriodo);
  }, [faturas, selectedPeriodo]);

  const exportarPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 15;

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE FATURAMENTO', pageWidth / 2, yPosition, { align: 'center' });
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

      // Tabela de faturas
      doc.setFontSize(11);
      doc.text('FATURAS DO PERÍODO', 15, yPosition);
      yPosition += 7;

      // Cabeçalho da tabela
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('Nº Fatura', 15, yPosition);
      doc.text('Cliente', 40, yPosition);
      doc.text('Total', 130, yPosition);
      doc.text('Pago', 150, yPosition);
      doc.text('Status', 170, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      doc.setDrawColor(200);
      doc.line(15, yPosition - 1, pageWidth - 15, yPosition - 1);

      // Dados da tabela
      faturasFiltradasPorPeriodo.forEach((fatura) => {
        if (yPosition > pageHeight - 15) {
          doc.addPage();
          yPosition = 15;
        }

        doc.text(fatura.numero, 15, yPosition);
        doc.text(fatura.cliente_nome.substring(0, 25), 40, yPosition);
        doc.text(
          `R$ ${fatura.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          130,
          yPosition,
          { align: 'right' }
        );
        doc.text(
          `R$ ${fatura.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          150,
          yPosition,
          { align: 'right' }
        );
        doc.text(fatura.status, 170, yPosition);
        yPosition += 6;
      });

      doc.save(`faturamento_${selectedPeriodo}.pdf`);
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
          <TrendingUp className="w-8 h-8 text-primary" />
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
            <FileText className="w-8 h-8 text-primary" />
            Dashboard de Faturamento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumo de faturamento, receitas e pendências
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

      {/* Tabela de Faturas */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Faturas do Período ({faturasFiltradasPorPeriodo.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nº Fatura</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Pago</th>
                <th className="px-4 py-3 text-right font-semibold">Pendente</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {faturasFiltradasPorPeriodo.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma fatura encontrada para este período.
                  </td>
                </tr>
              ) : (
                faturasFiltradasPorPeriodo.map((fatura) => (
                  <tr key={fatura.id} className="border-t border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-mono text-xs">{fatura.numero}</td>
                    <td className="px-4 py-3">{fatura.cliente_nome}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      R$ {fatura.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      R$ {fatura.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      R${' '}
                      {(fatura.total - fatura.valor_pago).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          fatura.status === 'paga'
                            ? 'bg-green-500/20 text-green-700'
                            : fatura.status === 'vencida'
                              ? 'bg-red-500/20 text-red-700'
                              : 'bg-yellow-500/20 text-yellow-700'
                        }`}
                      >
                        {fatura.status}
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

export default FaturamentoDashboardDN4;
