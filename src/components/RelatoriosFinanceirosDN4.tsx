import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  Building,
  TrendingUp,
  TrendingDown,
  PieChart,
  LineChart,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

interface RelatoriosFinanceirosDN4Props {
  empresaId?: string;
}

interface DadosRelatorio {
  periodo: string;
  receitas: number;
  despesas: number;
  resultado: number;
  recebidasPeriodo: number;
  pagasPeriodo: number;
  pendentesReceber: number;
  pendentesPagar: number;
}

const RelatoriosFinanceirosDN4: React.FC<RelatoriosFinanceirosDN4Props> = () => {
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosRelatorio | null>(null);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0]
  );
  const [dataFim, setDataFim] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

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
      const [tRec, tPag, rec, pag, emps] = await Promise.all([
        applyEmp(
          supabase
            .from('titulos_receber')
            .select('valor_original, saldo, status, data_vencimento')
            .gte('data_emissao', dataInicio)
            .lte('data_emissao', dataFim)
        ),
        applyEmp(
          supabase
            .from('titulos_pagar')
            .select('valor_previsto, saldo, status, data_vencimento')
            .gte('data_emissao', dataInicio)
            .lte('data_emissao', dataFim)
        ),
        supabase
          .from('recebimentos')
          .select('valor, data')
          .gte('data', dataInicio)
          .lte('data', dataFim),
        supabase
          .from('pagamentos')
          .select('valor, data')
          .gte('data', dataInicio)
          .lte('data', dataFim),
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

      const receitas = (tRec.data || []).reduce((sum, t) => sum + (t.valor_original || 0), 0);
      const despesas = (tPag.data || []).reduce((sum, t) => sum + (t.valor_previsto || 0), 0);
      const recebidasPeriodo = (rec.data || []).reduce((sum, r) => sum + (r.valor || 0), 0);
      const pagasPeriodo = (pag.data || []).reduce((sum, p) => sum + (p.valor || 0), 0);
      const pendentesReceber = (tRec.data || []).reduce((sum, t) => sum + (t.saldo || 0), 0);
      const pendentesPagar = (tPag.data || []).reduce((sum, t) => sum + (t.saldo || 0), 0);

      setDados({
        periodo: `${dataInicio} a ${dataFim}`,
        receitas,
        despesas,
        resultado: receitas - despesas,
        recebidasPeriodo,
        pagasPeriodo,
        pendentesReceber,
        pendentesPagar,
      });

      setEmpresas(emps.data || []);

      if (!selectedEmpresa && emps.data?.length) {
        setSelectedEmpresa(emps.data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
      toast.error('Erro ao carregar dados do relatório');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ext.loading) {
      carregar();
    }
  }, [ext.loading, ext.empresaIds, dataInicio, dataFim]);

  const exportarPDF = () => {
    if (!dados) return;

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 15;

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('RELATÓRIO FINANCEIRO CONSOLIDADO', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      doc.setFontSize(10);
      doc.text(`Período: ${dados.periodo}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, yPosition, {
        align: 'center',
      });
      yPosition += 15;

      // Resumo Executivo
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('RESUMO EXECUTIVO', 15, yPosition);
      yPosition += 8;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);

      const linhas = [
        `Receitas Previstas: R$ ${dados.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Despesas Previstas: R$ ${dados.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Resultado Esperado: R$ ${dados.resultado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        '',
        `Receitas Recebidas: R$ ${dados.recebidasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Despesas Pagas: R$ ${dados.pagasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        '',
        `Pendente Receber: R$ ${dados.pendentesReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Pendente Pagar: R$ ${dados.pendentesPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ];

      linhas.forEach((linha) => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 15;
        }
        if (linha === '') {
          yPosition += 3;
        } else {
          doc.text(linha, 15, yPosition);
          yPosition += 6;
        }
      });

      yPosition += 10;

      // Análise
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('ANÁLISE', 15, yPosition);
      yPosition += 8;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);

      const percentualRecebimento =
        dados.receitas > 0 ? Math.round((dados.recebidasPeriodo / dados.receitas) * 100) : 0;
      const percentualPagamento =
        dados.despesas > 0 ? Math.round((dados.pagasPeriodo / dados.despesas) * 100) : 0;

      const analise = [
        `Recebimento: ${percentualRecebimento}% das receitas foram recebidas no período.`,
        `Pagamento: ${percentualPagamento}% das despesas foram pagas no período.`,
        `Fluxo de Caixa: ${dados.recebidasPeriodo - dados.pagasPeriodo > 0 ? 'Positivo' : 'Negativo'} em R$ ${Math.abs(dados.recebidasPeriodo - dados.pagasPeriodo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ];

      analise.forEach((texto) => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 15;
        }
        doc.text(texto, 15, yPosition);
        yPosition += 6;
      });

      doc.save(`relatorio_financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
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
          <BarChart3 className="w-8 h-8 text-primary" />
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Nenhum dado disponível para o período selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Relatórios Financeiros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise consolidada de receitas, despesas e fluxo de caixa
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-card rounded-lg border border-border">
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
            Data Início
          </label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Calendar className="w-4 h-4" />
            Data Fim
          </label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
          />
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Receitas</p>
              <p className="text-xl font-bold mt-2 text-green-500">
                R$ {dados.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-green-500 opacity-20">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Despesas</p>
              <p className="text-xl font-bold mt-2 text-red-500">
                R$ {dados.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-red-500 opacity-20">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Resultado</p>
              <p className={`text-xl font-bold mt-2 ${dados.resultado >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                R$ {dados.resultado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`${dados.resultado >= 0 ? 'text-green-500' : 'text-red-500'} opacity-20`}>
              <LineChart className="w-5 h-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Fluxo Caixa</p>
              <p className={`text-xl font-bold mt-2 ${dados.recebidasPeriodo - dados.pagasPeriodo >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                R$ {(dados.recebidasPeriodo - dados.pagasPeriodo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`${dados.recebidasPeriodo - dados.pagasPeriodo >= 0 ? 'text-green-500' : 'text-red-500'} opacity-20`}>
              <PieChart className="w-5 h-5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Seção de Detalhes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Receitas
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Previstas:</span>
              <span className="font-semibold">R$ {dados.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Recebidas:</span>
              <span className="font-semibold">R$ {dados.recebidasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pendentes:</span>
              <span className="font-semibold">R$ {dados.pendentesReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            Despesas
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Previstas:</span>
              <span className="font-semibold">R$ {dados.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pagas:</span>
              <span className="font-semibold">R$ {dados.pagasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pendentes:</span>
              <span className="font-semibold">R$ {dados.pendentesPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelatoriosFinanceirosDN4;
