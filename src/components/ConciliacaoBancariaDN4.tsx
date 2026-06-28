import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Download,
  Upload,
  Filter,
  Calendar,
  Building,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

interface ConciliacaoBancariaDN4Props {
  empresaId?: string;
}

interface Conciliacao {
  id: string;
  conta_nome: string;
  data_inicio: string;
  data_fim: string;
  total_interno: number;
  total_extrato: number;
  divergencia: number;
  status: string;
}

interface Movimentacao {
  id: string;
  data: string;
  tipo: string;
  valor: number;
  descricao: string;
  conciliado: boolean;
  origem: string;
}

const ConciliacaoBancariaDN4: React.FC<ConciliacaoBancariaDN4Props> = () => {
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [conciliacoes, setConciliacoes] = useState<Conciliacao[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [selectedConta, setSelectedConta] = useState<string>('');
  const [selectedPeriodo, setSelectedPeriodo] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [stats, setStats] = useState({
    totalConciliado: 0,
    totalPendente: 0,
    percentualConciliacao: 0,
    divergencias: 0,
  });

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
      const [contas_data, conciliacoes_data, movimentacoes_data] = await Promise.all([
        applyEmp(
          supabase
            .from('contas_bancarias')
            .select('id, nome, banco, saldo_atual')
            .eq('status', 'ativa')
        ),
        applyEmp(
          supabase
            .from('conciliacoes')
            .select('id, conta_bancaria_id, data_inicio, data_fim, total_interno, total_extrato, divergencia, status, contas_bancarias(nome)')
            .order('data_fim', { ascending: false })
        ),
        applyEmp(
          supabase
            .from('movimentacoes_bancarias')
            .select('id, data, tipo, valor, descricao, conciliado, origem')
            .order('data', { ascending: false })
        ),
      ]);

      setContas(contas_data.data || []);

      const conciliacoesList = (conciliacoes_data.data || []).map((c: any) => ({
        id: c.id,
        conta_nome: c.contas_bancarias?.nome || 'Conta desconhecida',
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        total_interno: c.total_interno || 0,
        total_extrato: c.total_extrato || 0,
        divergencia: c.divergencia || 0,
        status: c.status,
      }));

      setConciliacoes(conciliacoesList);

      const movimentacoesList = (movimentacoes_data.data || []).map((m: any) => ({
        id: m.id,
        data: m.data,
        tipo: m.tipo,
        valor: m.valor || 0,
        descricao: m.descricao || 'Movimentação',
        conciliado: m.conciliado || false,
        origem: m.origem || 'manual',
      }));

      setMovimentacoes(movimentacoesList);

      if (!selectedConta && contas_data.data?.length) {
        setSelectedConta(contas_data.data[0].id);
      }

      // Calcular estatísticas
      const totalConciliado = movimentacoesList.filter((m) => m.conciliado).length;
      const totalPendente = movimentacoesList.filter((m) => !m.conciliado).length;
      const percentualConciliacao =
        totalConciliado + totalPendente > 0
          ? Math.round((totalConciliado / (totalConciliado + totalPendente)) * 100)
          : 0;
      const divergencias = conciliacoesList.filter((c) => c.divergencia !== 0).length;

      setStats({
        totalConciliado,
        totalPendente,
        percentualConciliacao,
        divergencias,
      });
    } catch (error) {
      console.error('Erro ao carregar conciliações:', error);
      toast.error('Erro ao carregar dados de conciliação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ext.loading) {
      carregar();
    }
  }, [ext.loading, ext.empresaIds]);

  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m) => {
      const competencia = m.data?.slice(0, 7);
      return competencia === selectedPeriodo;
    });
  }, [movimentacoes, selectedPeriodo]);

  const exportarPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 15;

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE CONCILIAÇÃO BANCÁRIA', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      doc.setFontSize(10);
      doc.text(`Período: ${selectedPeriodo}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 5;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, yPosition, {
        align: 'center',
      });
      yPosition += 10;

      // Estatísticas
      doc.setFontSize(11);
      doc.text('RESUMO DE CONCILIAÇÃO', 15, yPosition);
      yPosition += 7;

      doc.setFontSize(9);
      const statsTexts = [
        `Total Conciliado: ${stats.totalConciliado}`,
        `Total Pendente: ${stats.totalPendente}`,
        `Percentual de Conciliação: ${stats.percentualConciliacao}%`,
        `Divergências Encontradas: ${stats.divergencias}`,
      ];
      statsTexts.forEach((text) => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 15;
        }
        doc.text(text, 15, yPosition);
        yPosition += 6;
      });

      yPosition += 5;

      // Tabela de movimentações
      doc.setFontSize(11);
      doc.text('MOVIMENTAÇÕES DO PERÍODO', 15, yPosition);
      yPosition += 7;

      // Cabeçalho da tabela
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Data', 15, yPosition);
      doc.text('Tipo', 40, yPosition);
      doc.text('Descrição', 60, yPosition);
      doc.text('Valor', 140, yPosition);
      doc.text('Conciliado', 160, yPosition);
      doc.text('Origem', 190, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      doc.setDrawColor(200);
      doc.line(15, yPosition - 1, pageWidth - 15, yPosition - 1);

      // Dados da tabela
      movimentacoesFiltradas.forEach((mov) => {
        if (yPosition > pageHeight - 15) {
          doc.addPage();
          yPosition = 15;
        }

        doc.text(new Date(mov.data).toLocaleDateString('pt-BR'), 15, yPosition);
        doc.text(mov.tipo, 40, yPosition);
        doc.text(mov.descricao.substring(0, 30), 60, yPosition);
        doc.text(
          `R$ ${mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          140,
          yPosition,
          { align: 'right' }
        );
        doc.text(mov.conciliado ? 'Sim' : 'Não', 160, yPosition);
        doc.text(mov.origem, 190, yPosition);
        yPosition += 6;
      });

      doc.save(`conciliacao_${selectedPeriodo}.pdf`);
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
          <RefreshCw className="w-8 h-8 text-primary" />
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
            <CreditCard className="w-8 h-8 text-primary" />
            Conciliação Bancária
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reconciliação de movimentações e extratos bancários
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={carregar}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={exportarPDF}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          >
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card rounded-lg border border-border">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Building className="w-4 h-4" />
            Conta Bancária
          </label>
          <select
            value={selectedConta}
            onChange={(e) => setSelectedConta(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="">Todas as contas</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome} - {conta.banco}
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

      {/* KPIs de Conciliação */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Total Conciliado</p>
              <p className="text-xl font-bold mt-2 text-green-500">{stats.totalConciliado}</p>
            </div>
            <div className="text-green-500 opacity-20">
              <CheckCircle2 className="w-5 h-5" />
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
              <p className="text-xs text-muted-foreground font-medium uppercase">Total Pendente</p>
              <p className="text-xl font-bold mt-2 text-yellow-500">{stats.totalPendente}</p>
            </div>
            <div className="text-yellow-500 opacity-20">
              <Clock className="w-5 h-5" />
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
              <p className="text-xs text-muted-foreground font-medium uppercase">Percentual</p>
              <p className="text-xl font-bold mt-2 text-blue-500">{stats.percentualConciliacao}%</p>
            </div>
            <div className="text-blue-500 opacity-20">
              <TrendingUp className="w-5 h-5" />
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
              <p className="text-xs text-muted-foreground font-medium uppercase">Divergências</p>
              <p className={`text-xl font-bold mt-2 ${stats.divergencias > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {stats.divergencias}
              </p>
            </div>
            <div className={`${stats.divergencias > 0 ? 'text-red-500' : 'text-green-500'} opacity-20`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabela de Movimentações */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Movimentações do Período ({movimentacoesFiltradas.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Data</th>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-center font-semibold">Conciliado</th>
                <th className="px-4 py-3 text-center font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma movimentação encontrada para este período.
                  </td>
                </tr>
              ) : (
                movimentacoesFiltradas.map((mov) => (
                  <tr key={mov.id} className="border-t border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-mono text-xs">
                      {new Date(mov.data).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">{mov.tipo}</td>
                    <td className="px-4 py-3">{mov.descricao}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      R$ {mov.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          mov.conciliado
                            ? 'bg-green-500/20 text-green-700'
                            : 'bg-yellow-500/20 text-yellow-700'
                        }`}
                      >
                        {mov.conciliado ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs">{mov.origem}</td>
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

export default ConciliacaoBancariaDN4;
