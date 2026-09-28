import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, Percent, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, isTopacGoiania } from '@/lib/calculations';
import type { Employee } from '@/types/database';
import type { EmailPdfDraft } from '@/components/EmailPdfModal';

type Props = {
  employee: Employee;
  company?: { id: string; name: string; cnpj?: string; city?: string; cidade?: string; codigo?: string } | null;
  sessionUserId?: string;
  onEmailDraft: (draft: EmailPdfDraft) => void;
  updateEmployee: (id: string, changes: Partial<Employee>) => Promise<{ ok: boolean; error?: unknown }>;
  refreshData: () => Promise<void> | void;
};

type SalaryRequest = {
  id: string;
  competencia: string;
  salario_atual: number;
  percentual: number;
  salario_solicitado: number;
  status: string;
  solicitado_em: string;
};

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isJerriEmployee = (employee: Employee) =>
  employee.id === 'f93bd3f5-dfef-4a62-820d-bf553e7c63a0' || normalize(employee.name).includes('jerri');

const buildPdf = (lines: string[], employeeName: string, competencia: string) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SOLICITAÇÃO DE ALTERAÇÃO SALARIAL', 20, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 34;
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line || ' ', 170);
    doc.text(wrapped, 20, y);
    y += Math.max(5, wrapped.length * 5);
  });
  return doc.output('blob');
};

const SalaryChangeRequestPanel: React.FC<Props> = ({ employee, company, sessionUserId, onEmailDraft, updateEmployee, refreshData }) => {
  const [percentual, setPercentual] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [observacao, setObservacao] = useState('');
  const [pending, setPending] = useState<SalaryRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const pct = Number(String(percentual).replace(',', '.')) || 0;
  const salarioAtual = Number(employee.salarioBase || 0);
  const salarioNovo = useMemo(() => Math.round(salarioAtual * (1 + pct / 100) * 100) / 100, [salarioAtual, pct]);
  const isJerri = isJerriEmployee(employee);

  const loadPending = async () => {
    const { data, error } = await (supabase as any)
      .from('alteracoes_salariais')
      .select('id,competencia,salario_atual,percentual,salario_solicitado,status,solicitado_em')
      .eq('funcionario_id', employee.id)
      .eq('status', 'aguardando_folha')
      .order('solicitado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setPending(data || null);
  };

  useEffect(() => { void loadPending(); }, [employee.id]);

  const montarEmail = () => {
    if (!company) return toast.error('Empresa do funcionário não encontrada.');
    if (pct <= 0) return toast.error('Informe um percentual de reajuste maior que zero.');
    if (!competencia) return toast.error('Informe a competência do reajuste.');

    const accountingTo = isTopacGoiania(company)
      ? ['requisicao@incocontabilidade.com.br']
      : ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br'];

    const commissionLines = isJerri ? [
      '',
      'COMISSIONAMENTO DO VENDEDOR JERRI — manter a configuração já definida na plataforma:',
      '• Até R$ 500.000,00: 1%',
      '• De R$ 501.000,00 até R$ 649.999,99: 1,5%',
      '• A partir de R$ 650.000,00: 1,8%',
      'Essa configuração deve constar expressamente na formalização e na folha correspondente.',
    ] : [];

    const bodyLines = [
      'Bom dia,',
      '',
      'Solicito, por gentileza, a alteração salarial abaixo para processamento pela contabilidade:',
      '',
      `Funcionário: ${employee.name}`,
      `Empresa: ${company.name}`,
      `Competência: ${competencia}`,
      `Salário atual: ${formatCurrency(salarioAtual)}`,
      `Percentual de reajuste: ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`,
      `Novo salário solicitado: ${formatCurrency(salarioNovo)}`,
      ...(observacao.trim() ? [`Observação: ${observacao.trim()}`] : []),
      ...commissionLines,
      '',
      'IMPORTANTE: o salário no TOPAC RH PRO não será alterado neste momento. A plataforma somente aplicará o novo salário após o retorno da folha processada pela contabilidade para esta competência.',
      '',
      'Por favor, confirmem o processamento no retorno da folha.',
      '',
      'Atenciosamente,',
      'Rodrigo de Souza Sabino',
    ];

    const body = bodyLines.join('\n');
    const subject = `ALTERAÇÃO SALARIAL — ${employee.name} — ${company.name} — ${pct.toLocaleString('pt-BR')}%`;
    const attachmentBlob = buildPdf(bodyLines, employee.name, competencia);
    const attachmentName = `SOLICITACAO_ALTERACAO_SALARIAL_${employee.name.replace(/[^A-Za-z0-9]+/g, '_')}_${competencia}.pdf`;

    onEmailDraft({
      to: accountingTo,
      cc: isTopacGoiania(company) ? ['adm.gyn@topac.com.br'] : ['adm.matriz@topac.com.br', 'robson@topac.com.br'],
      subject,
      body,
      attachmentBlob,
      attachmentName,
      moduleOrigin: 'alteracao-salarial',
      senderUserId: sessionUserId,
      documentName: 'Solicitação de alteração salarial',
      afterSend: async () => {
        const { error } = await (supabase as any).from('alteracoes_salariais').insert({
          funcionario_id: employee.id,
          empresa_id: company.id,
          competencia,
          salario_atual: salarioAtual,
          percentual: pct,
          salario_solicitado: salarioNovo,
          observacao: observacao.trim() || null,
          email_assunto: subject,
          email_corpo: body,
          status: 'aguardando_folha',
          solicitado_por: sessionUserId || null,
        });
        if (error) throw error;
        await loadPending();
      },
    });
  };

  const aplicarAposRetorno = async () => {
    if (!pending || !company) return;
    setLoading(true);
    try {
      const { data: ciclo, error: cicloError } = await (supabase as any)
        .from('contabilidade_folha_ciclos')
        .select('id,status,email_retorno_status,enviado_em')
        .eq('empresa_id', company.id)
        .eq('competencia', pending.competencia)
        .or('status.eq.conferido,email_retorno_status.eq.enviado')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cicloError) throw cicloError;
      if (!ciclo) {
        toast.error('A folha desta competência ainda não voltou da contabilidade. O salário não foi alterado.');
        return;
      }

      const result = await updateEmployee(employee.id, { salarioBase: Number(pending.salario_solicitado) });
      if (!result.ok) throw result.error || new Error('Falha ao atualizar salário.');

      const { error: reqError } = await (supabase as any)
        .from('alteracoes_salariais')
        .update({
          status: 'aplicado',
          aplicado_por: sessionUserId || null,
          aplicado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pending.id);
      if (reqError) throw reqError;
      await refreshData();
      await loadPending();
      toast.success('Folha retornada e salário atualizado na ficha oficial.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível aplicar a alteração salarial.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2"><Percent className="h-5 w-5 text-violet-300" /></div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Alteração salarial</h3>
          <p className="text-xs text-muted-foreground">Solicita à contabilidade por e-mail. O salário só muda na plataforma depois que a folha retornar.</p>
        </div>
      </div>

      {pending ? (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/5 p-3">
          <p className="text-xs font-bold text-amber-300">AGUARDANDO RETORNO DA FOLHA</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pending.competencia} · {formatCurrency(Number(pending.salario_atual))} → {formatCurrency(Number(pending.salario_solicitado))} · {Number(pending.percentual).toLocaleString('pt-BR')}%
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={aplicarAposRetorno} disabled={loading}>
            {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirmar retorno da folha e aplicar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Salário atual</label>
            <div className="min-h-10 rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">{formatCurrency(salarioAtual)}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">% de reajuste</label>
            <Input value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="decimal" placeholder="Ex.: 6" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Novo salário</label>
            <div className="min-h-10 rounded-md bg-muted/50 px-3 py-2 text-sm font-bold text-violet-200">{formatCurrency(salarioNovo)}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Competência</label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs text-muted-foreground">Observação</label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
          </div>
          {isJerri && (
            <div className="md:col-span-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <strong className="text-amber-300">Jerri:</strong> o e-mail incluirá também a configuração de comissão: até R$ 500 mil = 1%; R$ 501 mil a R$ 649.999,99 = 1,5%; a partir de R$ 650 mil = 1,8%.
            </div>
          )}
          <div className="md:col-span-4">
            <Button onClick={montarEmail}><Mail className="mr-2 h-4 w-4" /> Solicitar alteração à contabilidade</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryChangeRequestPanel;
