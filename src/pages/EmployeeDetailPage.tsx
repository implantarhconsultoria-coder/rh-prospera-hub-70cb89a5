import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { formatCurrency, formatDate, feriasStatus, asoStatus } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, FileText, Mail, Pencil, Save, Trash2, UserMinus } from 'lucide-react';
import HistoricoDocumentalFuncionario from '@/components/HistoricoDocumentalFuncionario';
import AsoAgendamentosFuncionario from '@/components/AsoAgendamentosFuncionario';
import { employeeHasInsalubridade, getPericulosidadeAplicavel } from '@/lib/employeeRoleRules';
import { gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';
import { CC_OBRIGATORIO, DESTINATARIOS_ASO } from '@/lib/emailUtils';
import { arquivarDocumentoFuncionario, marcarComoEnviado } from '@/lib/documentoHistorico';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import { toast } from 'sonner';
import { prepareDocumentTextForSave } from '@/lib/documentoHistoricoTexto';
import BenefitValuePaymentEditor from '@/components/BenefitValuePaymentEditor';
import { clearPersistentViewState, usePersistentViewState } from '@/hooks/usePersistentViewState';
import { supabase } from '@/integrations/supabase/client';
import type { Employee } from '@/types/database';

const tabs = ['Dados Cadastrais', 'Dados Funcionais', 'Benefícios', 'Férias e ASO', 'Lançamentos', 'Histórico Documental'];

type FieldProps = { label: string; value: string | number; onChange?: (v: string) => void; type?: string };
const Field: React.FC<FieldProps> = React.memo(({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="text-xs text-muted-foreground block mb-1">{label}</label>
    {onChange ? (
      <Input value={value} type={type} onChange={e => onChange(e.target.value)} className="text-sm" />
    ) : (
      <p className="text-sm font-medium text-foreground bg-muted/50 px-3 py-2 rounded-md min-h-10">{value}</p>
    )}
  </div>
));

type ToggleProps = { label: string; active: boolean; onToggle?: () => void; valueLabel?: string; value?: number; disabled?: boolean };
const ToggleRow: React.FC<ToggleProps> = React.memo(({ label, active, onToggle, valueLabel, value, disabled }) => (
  <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
    <div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {valueLabel && <span className="text-xs text-muted-foreground ml-2">({valueLabel}: {formatCurrency(value || 0)})</span>}
    </div>
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      className={`w-12 h-6 rounded-full transition-colors ${active ? 'bg-success' : 'bg-muted'} relative disabled:cursor-not-allowed disabled:opacity-55`}
    >
      <div className={`w-5 h-5 bg-card rounded-full absolute top-0.5 transition-transform ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </button>
  </div>
));

const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { employees, companies, updateEmployee, refreshData, session, userRoles } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const detailStateKey = `funcionario:detalhe:${id || 'sem-id'}`;
  const [detailState, setDetailState] = usePersistentViewState(detailStateKey, {
    activeTab: 0,
    isEditing: false,
    draft: null as Employee | null,
  });
  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [inactivating, setInactivating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const emp = employees.find(e => e.id === id);
  const isAdmin = userRoles.includes('admin');
  const isEditing = isAdmin && detailState.isEditing;
  const workingEmp = isEditing && detailState.draft?.id === emp?.id ? detailState.draft : emp;
  const activeTab = Math.max(0, Math.min(tabs.length - 1, Number(detailState.activeTab) || 0));
  const setActiveTab = (tab: number) => setDetailState((current) => ({ ...current, activeTab: tab }));
  const [observacoesGerais, setObservacoesGerais] = useState(emp?.observacoes || '');
  const [salvandoObservacoes, setSalvandoObservacoes] = useState(false);

  useEffect(() => {
    setObservacoesGerais(emp?.observacoes || '');
  }, [emp?.id, emp?.observacoes]);

  const portalPrefix = location.pathname.startsWith('/filial') ? '/filial'
    : location.pathname.startsWith('/admin') ? '/admin' : '';

  if (!emp || !workingEmp) return <div className="p-8 text-center text-muted-foreground">Funcionário não encontrado</div>;

  const company = companies.find(c => c.id === workingEmp.companyId);
  const fer = feriasStatus(emp.dataAdmissao);
  const aso = asoStatus(emp.dataExameMedico);
  const insalubridadeLiberada = employeeHasInsalubridade(workingEmp);
  const periculosidade = getPericulosidadeAplicavel(workingEmp);
  const funcionarioDesligado = /deslig|inativ|exclu/i.test(String(emp.status || ''));

  const updateDraft = (data: Partial<Employee>) => {
    if (!isEditing) return;
    setDetailState((current) => ({
      ...current,
      draft: { ...(current.draft || emp), ...data },
    }));
  };

  const fieldFor = (field: keyof Employee, type: string = 'text') => ({
    value: (workingEmp as any)[field] ?? '',
    type,
    onChange: isEditing ? (v: string) => updateDraft({ [field]: type === 'number' ? Number(v) : v } as Partial<Employee>) : undefined,
  });

  const toggleFor = (field: keyof Employee) => ({
    active: !!(workingEmp as any)[field],
    onToggle: isEditing ? () => updateDraft({ [field]: !(workingEmp as any)[field] } as Partial<Employee>) : undefined,
    disabled: !isEditing,
  });

  const startEditing = () => {
    setDetailState((current) => ({ ...current, isEditing: true, draft: { ...emp } }));
  };

  const cancelEditing = () => {
    setDetailState((current) => ({ ...current, isEditing: false, draft: null }));
  };

  const saveEditing = async () => {
    if (!detailState.draft || savingEdit) return;
    if (!detailState.draft.name?.trim()) return toast.error('Nome do funcionário é obrigatório.');
    if (!companies.some((item) => item.id === detailState.draft?.companyId)) return toast.error('Selecione uma empresa válida.');
    setSavingEdit(true);
    try {
      const result = await updateEmployee(emp.id, detailState.draft);
      if (!result.ok) return;
      setDetailState((current) => ({ ...current, isEditing: false, draft: null }));
      toast.success('Alterações do funcionário salvas no banco.');
    } finally {
      setSavingEdit(false);
    }
  };

  const inactivateEmployee = async () => {
    if (inactivating) return;
    const confirmed = window.confirm(`Inativar ${emp.name}?\n\nO funcionário sairá da operação ativa, mas o histórico será mantido.`);
    if (!confirmed) return;
    setInactivating(true);
    try {
      const result = await updateEmployee(emp.id, { status: 'desligado' });
      if (!result.ok) return;
      cancelEditing();
      toast.success('Funcionário inativado. O histórico foi preservado.');
    } finally {
      setInactivating(false);
    }
  };

  const deleteEmployee = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_excluir_funcionario_seguro', {
        p_funcionario_id: emp.id,
        p_motivo: deleteReason.trim() || null,
      });
      if (error) {
        console.error('Erro ao excluir funcionário:', error);
        toast.error(`Não foi possível excluir ${emp.name}: ${error.message}`);
        return;
      }

      const result = (data || {}) as { modo?: string; vinculos_total?: number };
      const listRoute = `${portalPrefix}/funcionarios`;
      clearPersistentViewState(detailStateKey);
      if (typeof window !== 'undefined' && portalPrefix) {
        window.sessionStorage.setItem(`topac:last-route:v1:${listRoute}`, listRoute);
      }
      setDeleteOpen(false);
      setDeleteReason('');
      await refreshData();
      navigate(listRoute, { replace: true });

      if (result.modo === 'definitiva') {
        toast.success(`${emp.name} foi excluído definitivamente. Não havia registros vinculados.`);
      } else {
        toast.success(`${emp.name} foi excluído da operação. ${Number(result.vinculos_total || 0)} registro(s) histórico(s) foram preservados.`);
      }
    } finally {
      setDeleting(false);
    }
  };

  const buildAsoDemissionalPdf = () => {
    if (!company) {
      toast.error('Empresa do funcionario nao encontrada.');
      return null;
    }
    const dataExame = new Date().toISOString().slice(0, 10);
    return gerarAutorizacaoExameAdmissionalPdf({
      empresa: company.name || '',
      cnpj: company.cnpj || '',
      nome: emp.name || '',
      cpf: emp.cpf || '',
      rg: emp.rg || '',
      funcao: emp.cargo || '',
      dataAdmissao: emp.dataAdmissao || '',
      dataNascimento: (emp as any).dataNascimento || '',
      setorGhe: (emp as any).setorGhe || '',
      dataExame,
      tipoExame: 'Demissional',
      obraLocal: company.name || '',
      trabalhoAltura: false,
      espacoConfinado: false,
      toxicologico: false,
      responsavelContato: 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385',
    });
  };

  const abrirPdf = (pdf: { blob: Blob; fileName: string }) => {
    const url = URL.createObjectURL(pdf.blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const arquivarAsoDemissional = async (pdf: { blob: Blob; fileName: string }) => {
    if (!session?.user || !company) return null;
    return arquivarDocumentoFuncionario({
      funcionarioId: emp.id,
      funcionarioNome: emp.name,
      companyId: emp.companyId,
      empresaNome: company.name || '',
      tipoDocumento: 'ASO - Demissional',
      descricao: `Guia ASO demissional gerada para ${emp.name}`,
      conteudo: pdf.blob,
      extensao: 'pdf',
      storageTipo: 'aso-demissional',
      geradoPorUserId: session.user.id,
      geradoPorNome: 'Rodrigo De Souza Sabino',
      unidade: company.name || '',
      categoria: 'ASO',
      origem: 'gerado_sistema',
      observacao: 'Solicitacao de exame demissional',
      nomeArquivo: pdf.fileName,
      dataDocumento: new Date().toISOString(),
    });
  };

  const gerarAsoDemissional = async () => {
    const pdf = buildAsoDemissionalPdf();
    if (!pdf) return;
    abrirPdf(pdf);
    try {
      await arquivarAsoDemissional(pdf);
      toast.success('Guia ASO demissional gerada e salva no historico documental.');
    } catch (error: any) {
      toast.warning(`Guia aberta, mas nao foi arquivada: ${error?.message || 'erro desconhecido'}`);
    }
  };

  const salvarObservacoesGerais = async () => {
    setSalvandoObservacoes(true);
    try {
      const result = await updateEmployee(emp.id, {
        observacoes: prepareDocumentTextForSave(observacoesGerais),
      });
      if (result.ok) toast.success('Observações gerais salvas.');
    } finally {
      setSalvandoObservacoes(false);
    }
  };

  const enviarAsoDemissional = () => {
    const pdf = buildAsoDemissionalPdf();
    if (!pdf || !company) return;
    setEmailPdfDraft({
      to: Array.from(DESTINATARIOS_ASO),
      cc: Array.from(CC_OBRIGATORIO),
      subject: `Solicitacao de exame demissional - ${emp.name} - ${company.name || ''}`,
      body: [
        'Prezados, bom dia.',
        '',
        'Solicito, por gentileza, o agendamento do exame demissional conforme guia ASO anexa.',
        '',
        `Nome: ${emp.name}`,
        `CPF: ${emp.cpf || ''}`,
        `Funcao: ${emp.cargo || ''}`,
        `Empresa: ${company.name || ''}`,
        `Data de admissao: ${formatDate(emp.dataAdmissao)}`,
        `Status: ${emp.status || 'desligado'}`,
        '',
        'Escopo: exame demissional ocupacional para processo de desligamento TOPAC.',
        '',
        'Favor confirmar recebimento e data/horario disponivel.',
        '',
        'Atenciosamente,',
        'Rodrigo De Souza Sabino',
      ].join('\n'),
      attachmentBlob: pdf.blob,
      attachmentName: pdf.fileName,
      afterSend: async () => {
        const registro = await arquivarAsoDemissional(pdf);
        if ((registro as any)?.id && session?.user) {
          await marcarComoEnviado(
            (registro as any).id,
            session.user.id,
            'Rodrigo De Souza Sabino',
            [...DESTINATARIOS_ASO, ...CC_OBRIGATORIO].join(', '),
          );
        }
      },
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${portalPrefix}/funcionarios`)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold font-display text-foreground">{workingEmp.name}</h1>
          <p className="text-sm text-muted-foreground">{workingEmp.cargo} — {company?.name}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Badge className={emp.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>{emp.status}</Badge>
          {isAdmin && !isEditing && (
            <>
              <Button type="button" variant="outline" onClick={startEditing}><Pencil className="mr-2 h-4 w-4" /> Editar funcionário</Button>
              {emp.status === 'ativo' && <Button type="button" variant="outline" onClick={() => void inactivateEmployee()} disabled={inactivating}><UserMinus className="mr-2 h-4 w-4" /> {inactivating ? 'Inativando...' : 'Inativar'}</Button>}
              <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</Button>
            </>
          )}
          {isAdmin && isEditing && (
            <>
              <Button type="button" onClick={() => void saveEditing()} disabled={savingEdit}><Save className="mr-2 h-4 w-4" /> {savingEdit ? 'Salvando...' : 'Salvar alterações'}</Button>
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={savingEdit}>Cancelar</Button>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          <strong>Modo de edição ativo.</strong> As alterações ficam em rascunho e só são gravadas no Supabase ao clicar em <strong>Salvar alterações</strong>.
        </div>
      )}

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${i === activeTab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="card-premium p-6">
        {activeTab === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Nome Completo" {...fieldFor('name')} />
            <Field label="CPF" {...fieldFor('cpf')} />
            <Field label="Telefone" {...fieldFor('telefone')} />
            <Field label="E-mail" {...fieldFor('email')} />
            <Field label="Endereço" {...fieldFor('endereco')} />
            <Field label="PIX" {...fieldFor('pix')} />
            <Field label="Banco" {...fieldFor('banco')} />
            <Field label="Agencia" {...fieldFor('agencia')} />
            <Field label="Conta" {...fieldFor('conta')} />
          </div>
        )}
        {activeTab === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isEditing ? (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
                  <select value={workingEmp.companyId} onChange={(e) => updateDraft({ companyId: e.target.value })} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground w-full min-h-10">
                    {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              ) : <Field label="Empresa" value={company?.name || ''} />}
              <Field label="CNPJ" value={company?.cnpj || ''} />
              <Field label="Nº Registro" {...fieldFor('registro')} />
              <Field label="Matrícula eSocial" {...fieldFor('matriculaEsocial')} />
              <Field label="Cargo / Função" {...fieldFor('cargo')} />
              <Field label="Salário Base" {...fieldFor('salarioBase', 'number')} />
              <Field label="Data Admissão" {...fieldFor('dataAdmissao', 'date')} />
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                {isEditing ? (
                  <select value={workingEmp.status} onChange={e => updateDraft({ status: e.target.value as Employee['status'] })}
                    className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground w-full min-h-10">
                    <option value="ativo">Ativo</option>
                    <option value="afastado">Afastado</option>
                    <option value="férias">Férias</option>
                    <option value="desligado">Desligado</option>
                  </select>
                ) : <p className="text-sm font-medium text-foreground bg-muted/50 px-3 py-2 rounded-md min-h-10">{emp.status}</p>}
              </div>
            </div>
            {funcionarioDesligado && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">ASO demissional</p>
                  <p className="text-xs text-muted-foreground">Funcionario desligado/inativo. Gere a guia e envie a solicitacao do exame demissional.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={gerarAsoDemissional}>
                    <FileText className="w-4 h-4 mr-2" /> Gerar ASO demissional
                  </Button>
                  <Button type="button" onClick={enviarAsoDemissional}>
                    <Mail className="w-4 h-4 mr-2" /> Enviar exame demissional
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 2 && (
          <div className="space-y-3">
            <ToggleRow label="Vale Refeição (VR)" {...toggleFor('vrAtivo')} valueLabel="Diário" value={workingEmp.vrDiario} />
            {workingEmp.vrAtivo && (
              <BenefitValuePaymentEditor
                benefitType="VR"
                employee={emp}
                company={companies.find(c => c.id === emp.companyId)}
                currentValue={emp.vrDiario}
                onUpdateValue={(value) => updateEmployee(emp.id, { vrDiario: value })}
                actorId={session?.user?.id}
              />
            )}
            <ToggleRow label="Vale Alimentação (VA)" {...toggleFor('vaAtivo')} valueLabel="Mensal" value={workingEmp.vaMensal} />
            {workingEmp.vaAtivo && <Field label="Valor Mensal VA" {...fieldFor('vaMensal', 'number')} />}
            <ToggleRow label="Vale Transporte (VT)" {...toggleFor('vtAtivo')} valueLabel="Diário" value={workingEmp.vtDiario} />
            {workingEmp.vtAtivo && (
              <BenefitValuePaymentEditor
                benefitType="VT"
                employee={emp}
                company={companies.find(c => c.id === emp.companyId)}
                currentValue={emp.vtDiario}
                onUpdateValue={(value) => updateEmployee(emp.id, { vtDiario: value })}
                actorId={session?.user?.id}
              />
            )}
            {insalubridadeLiberada ? (
              <>
                <ToggleRow label="Insalubridade" {...toggleFor('insalubridadeAtiva')} valueLabel="Valor" value={workingEmp.insalubridadeValor} />
                {workingEmp.insalubridadeAtiva && <Field label="Valor Insalubridade" {...fieldFor('insalubridadeValor', 'number')} />}
              </>
            ) : (
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <span className="text-sm font-medium text-foreground">Insalubridade</span>
                <span className="text-xs text-muted-foreground">Somente mecanicos</span>
              </div>
            )}
            {periculosidade > 0 && (
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <span className="text-sm font-medium text-foreground">Periculosidade</span>
                <span className="text-xs text-muted-foreground">30% do salario: {formatCurrency(periculosidade)}</span>
              </div>
            )}
          </div>
        )}
        {activeTab === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold font-display text-foreground">Férias</h3>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm"><span className="text-muted-foreground">Status:</span> <Badge className={`ml-1 text-xs ${fer.status === 'em dia' ? 'bg-success text-success-foreground' : fer.status === 'atenção' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}`}>{fer.status}</Badge></p>
                <p className="text-sm"><span className="text-muted-foreground">Período Atual:</span> {fer.periodoAtual + 1}º</p>
                <p className="text-sm"><span className="text-muted-foreground">Meses no Período:</span> {fer.mesesNoPeriodo}</p>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold font-display text-foreground">ASO</h3>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm"><span className="text-muted-foreground">Status:</span> <Badge className={`ml-1 text-xs ${aso.status === 'ok' ? 'bg-success text-success-foreground' : aso.status === 'próximo' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}`}>{aso.status}</Badge></p>
                <p className="text-sm"><span className="text-muted-foreground">Último Exame:</span> {formatDate(emp.dataExameMedico)}</p>
                <p className="text-sm"><span className="text-muted-foreground">Próximo ASO:</span> {formatDate(aso.proximoASO.toISOString())}</p>
                <p className="text-sm"><span className="text-muted-foreground">Dias Restantes:</span> {aso.diasRestantes}</p>
                <Field label="Data Exame Médico" {...fieldFor('dataExameMedico', 'date')} />
                <AsoAgendamentosFuncionario funcionarioId={emp.id} companyId={emp.companyId} />
              </div>
            </div>
          </div>
        )}
        {activeTab === 4 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Acesse o módulo de Lançamentos Mensais para gerenciar os lançamentos deste funcionário.</p>
            <Button className="mt-4" onClick={() => navigate(`${portalPrefix}/lancamentos`)}>Ir para Lançamentos</Button>
          </div>
        )}
        {activeTab === 5 && (
          <div className="space-y-6">
            <HistoricoDocumentalFuncionario funcionarioId={emp.id} />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Observações Gerais</label>
              <textarea
                value={observacoesGerais}
                onChange={(e) => setObservacoesGerais(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[120px]"
                placeholder="Observações adicionais do funcionário..."
              />
              <div className="flex justify-end mt-2">
                <Button type="button" onClick={salvarObservacoesGerais} disabled={salvandoObservacoes}>
                  <Save className="w-4 h-4 mr-2" />
                  {salvandoObservacoes ? 'Salvando...' : 'Salvar observações'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Excluir funcionário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p>Você está prestes a excluir <strong>{emp.name}</strong>.</p>
            <p className="text-muted-foreground">Se não houver registros vinculados, o cadastro será removido definitivamente. Se houver histórico de ponto, EPI, folha, assinatura ou outros vínculos, ele será preservado e o funcionário será removido da operação ativa.</p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Motivo da exclusão (opcional)</label>
              <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="w-full min-h-20 rounded-lg border bg-background px-3 py-2" placeholder="Informe o motivo, se necessário..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void deleteEmployee()} disabled={deleting}><Trash2 className="mr-2 h-4 w-4" /> {deleting ? 'Excluindo...' : 'Confirmar exclusão'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailPdfModal
        open={!!emailPdfDraft}
        draft={emailPdfDraft}
        onOpenChange={(open) => {
          if (!open) setEmailPdfDraft(null);
        }}
      />
    </div>
  );
};

export default EmployeeDetailPage;
