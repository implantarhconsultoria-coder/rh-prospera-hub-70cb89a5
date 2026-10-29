import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Loader2, Plus, Printer, RefreshCcw, Save, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registrarAcao } from '@/lib/acoesLog';
import { sha256Browser } from '@/lib/payrollDocuments';
import { downloadPdfBlob } from '@/lib/savePdf';
import GarageReceiptAdminModule from '@/components/payroll/GarageReceiptAdminModule';
import {
  buildGarageConsolidatedPdf, buildGarageIndividualPdf, garageReceiptFilename,
  type GarageReceiptData,
} from '@/lib/garageReceipts';

type GarageBenefit = {
  employee_id: string;
  company_id: string;
  ativo: boolean;
  valor_mensal: number;
  veiculo: string;
  placa: string;
  atualizado_em: string;
};

const ALL = 'todas';
const money = (amount: number) => Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const safeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]/g, '_');
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

const GaragemPage: React.FC = () => {
  const { employees, companies, session, userRoles } = useApp();
  const [competencia, setCompetencia] = useState(currentMonth);
  const [dataPagamento, setDataPagamento] = useState(currentMonth() + '-03');
  const [companyId, setCompanyId] = useState(ALL);
  const [benefits, setBenefits] = useState<GarageBenefit[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [newVehicle, setNewVehicle] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [rowEdit, setRowEdit] = useState<Record<string, { veiculo: string; placa: string }>>({});
  const [lastGenerated, setLastGenerated] = useState('');

  const allowed = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  const employeeMap = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  const companyMap = useMemo(() => new Map(companies.map(company => [company.id, company])), [companies]);

  const load = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any).from('garagem_beneficiarios')
      .select('employee_id,company_id,ativo,valor_mensal,veiculo,placa,atualizado_em')
      .order('atualizado_em', { ascending: false });
    if (error) toast.error('Não foi possível carregar beneficiários de garagem: ' + error.message);
    else setBenefits((data || []) as GarageBenefit[]);
    setLoading(false);
  }, [allowed]);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => benefits.filter(item => item.ativo && employeeMap.get(item.employee_id)?.status === 'ativo'), [benefits, employeeMap]);
  const shown = useMemo(() => active.filter(item => companyId === ALL || item.company_id === companyId), [active, companyId]);
  const enrollmentCompany = companyId !== ALL ? companyId : '';
  const enrollable = useMemo(() => employees
    .filter(employee => employee.status === 'ativo'
      && (!enrollmentCompany || employee.companyId === enrollmentCompany)
      && !active.some(row => row.employee_id === employee.id))
    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, active, enrollmentCompany]);

  const buildReceiptData = (row: GarageBenefit): GarageReceiptData | null => {
    const employee = employeeMap.get(row.employee_id);
    const company = companyMap.get(row.company_id);
    if (!employee || !company || employee.companyId !== row.company_id || employee.status !== 'ativo') return null;
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      cpf: employee.cpf,
      cargo: employee.cargo,
      registro: employee.registro,
      companyId: company.id,
      companyName: company.name,
      cnpj: company.cnpj,
      veiculo: row.veiculo,
      placa: row.placa,
      competencia, dataPagamento,
      valor: Number(row.valor_mensal),
    };
  };
  const reportRows = shown.map(buildReceiptData).filter((value): value is GarageReceiptData => value !== null);
  const total = shown.reduce((sum, row) => sum + Number(row.valor_mensal || 0), 0);

  const audit = async (action: string, row: GarageBenefit | { employee_id: string; company_id: string }, before?: unknown, after?: unknown) => {
    await registrarAcao({
      modulo: 'garagem', entidade: 'garagem_beneficiarios', entidadeId: row.employee_id,
      acao: action, antes: before, depois: after,
      observacao: 'Alteração de benefício garagem para funcionário cadastrado',
    }, { userId: session?.user?.id, userEmail: session?.user?.email, origem: 'admin' });
  };

  const enroll = async () => {
    const employee = employeeMap.get(selectedEmployeeId);
    if (!employee || employee.status !== 'ativo' || (enrollmentCompany && employee.companyId !== enrollmentCompany)) {
      return toast.error('Selecione um funcionário ativo já cadastrado na empresa.');
    }
    if (!newPlate.trim() || !newVehicle.trim()) return toast.error('Informe o veículo e a placa do funcionário.');
    setBusy(true);
    const existing = benefits.find(item => item.employee_id === employee.id);
    const next = {
      employee_id: employee.id, company_id: employee.companyId,
      ativo: true, valor_mensal: existing?.valor_mensal || 200,
      veiculo: newVehicle.trim(), placa: newPlate.trim().toUpperCase(),
    };
    const { error } = await (supabase as any).from('garagem_beneficiarios').upsert(next, { onConflict: 'employee_id' });
    if (error) toast.error(error.message);
    else {
      await audit(existing ? 'reabriu' : 'criou', next, existing || null, next);
      toast.success('Funcionário incluído no benefício de garagem.');
      setSelectedEmployeeId(''); setNewVehicle(''); setNewPlate('');
      await load();
    }
    setBusy(false);
  };

  const deactivate = async (row: GarageBenefit) => {
    const employee = employeeMap.get(row.employee_id);
    if (!window.confirm('Retirar ' + (employee?.name || 'este funcionário') + ' dos próximos recibos de garagem? O histórico será preservado.')) return;
    setBusy(true);
    const { error } = await (supabase as any).from('garagem_beneficiarios')
      .update({ ativo: false }).eq('employee_id', row.employee_id).eq('company_id', row.company_id);
    if (error) toast.error(error.message);
    else { await audit('cancelou', row, row, { ...row, ativo: false }); toast.success('Benefício desativado; recibos anteriores preservados.'); await load(); }
    setBusy(false);
  };

  const saveVehicle = async (row: GarageBenefit) => {
    const edit = rowEdit[row.employee_id];
    if (!edit || !edit.veiculo.trim() || !edit.placa.trim()) return toast.error('Preencha veículo e placa.');
    setBusy(true);
    const next = { veiculo: edit.veiculo.trim(), placa: edit.placa.trim().toUpperCase() };
    const { error } = await (supabase as any).from('garagem_beneficiarios')
      .update(next).eq('employee_id', row.employee_id).eq('company_id', row.company_id);
    if (error) toast.error(error.message);
    else { await audit('editou', row, row, next); toast.success('Veículo atualizado.'); await load(); }
    setBusy(false);
  };

  const validateGeneration = () => {
    if (!validMonth(competencia) || !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
      toast.error('Confira a competência e a data de referência.');
      return false;
    }
    if (!reportRows.length) { toast.error('Não há beneficiários ativos nesta seleção.'); return false; }
    if (reportRows.some(item => !item.placa || !item.veiculo)) { toast.error('Todos os beneficiários precisam de veículo e placa.'); return false; }
    return true;
  };

  const printIndividual = (row: GarageBenefit) => {
    const value = buildReceiptData(row);
    if (!value || !validateGeneration()) return;
    downloadPdfBlob(buildGarageIndividualPdf(value), garageReceiptFilename(value));
  };

  const printConsolidated = () => {
    if (!validateGeneration()) return;
    downloadPdfBlob(buildGarageConsolidatedPdf(reportRows), 'TOPAC_RH_Consolidado_Garagem_' + competencia + '.pdf');
  };

  const generateReceipts = async () => {
    if (!validateGeneration()) return;
    if (!window.confirm('Gerar recibos para ' + reportRows.length + ' funcionário(s) cadastrado(s), competência ' + competencia + '? Recibos existentes serão mantidos.')) return;
    setBusy(true); let created = 0, skipped = 0, failures = 0;
    for (const row of reportRows) {
      try {
        const { data: existing, error: lookupError } = await (supabase as any).from('payroll_documents')
          .select('id').eq('company_id',row.companyId).eq('employee_id',row.employeeId)
          .eq('competencia',competencia).eq('document_type','RECIBO_GARAGEM')
          .eq('is_current',true).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) { skipped += 1; continue; }
        const file = buildGarageIndividualPdf(row);
        const bytes = await file.arrayBuffer();
        const hash = await sha256Browser(bytes);
        const name = garageReceiptFilename(row);
        const path = row.companyId + '/' + competencia + '/garagem/' + row.employeeId + '/' + crypto.randomUUID() + '-' + safeName(name);
        const { error: storageError } = await supabase.storage.from('payroll-private')
          .upload(path, file, { contentType:'application/pdf',upsert:false });
        if (storageError) throw storageError;
        const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
          company_id: row.companyId, employee_id: row.employeeId, competencia,
          document_type:'RECIBO_GARAGEM',storage_bucket:'payroll-private',storage_path:path,
          original_filename:name,mime_type:'application/pdf',file_size:bytes.byteLength,
          document_sha256:hash,source_sha256:hash,document_version:1,is_current:true,
          net_amount:row.valor,entitlement_amount:row.valor,prior_paid_amount:0,
          extracted_data:{
            origem:'RECIBO_GARAGEM', valor_garagem:row.valor,
            veiculo:row.veiculo, placa:row.placa, data_referencia:dataPagamento,
            nao_bloqueante:true, pode_anexar_depois:true,
          },
          match_confidence:100,status:'AGUARDANDO_ASSINATURA',
          confirmed:true,confirmed_at:new Date().toISOString(),
          payment_kind:'ORIGINAL',payment_sequence:1,payment_reason:'Custeio de garagem',
          payment_state:'GERADO',
        });
        if (insertError) {
          await supabase.storage.from('payroll-private').remove([path]);
          throw insertError;
        }
        created += 1;
      } catch (error) {
        failures += 1;
        console.error('[garagem-geracao]', row.employeeId, error);
      }
    }
    setLastGenerated(created + ' novo(s), ' + skipped + ' já existente(s), ' + failures + ' falha(s).');
    if (failures) toast.error('Geração parcial. Consulte os recibos abaixo e tente novamente para os pendentes.');
    else toast.success('Recibos gerados e vinculados ao cadastro. ' + created + ' novo(s); ' + skipped + ' preservado(s).');
    await audit('gerou', { employee_id:reportRows[0].employeeId, company_id: reportRows[0].companyId }, null, { competencia, created, skipped, failures });
    setBusy(false);
  };

  if (!allowed) return <div className="rounded-xl border p-6">Acesso restrito à administração de RH.</div>;

  return (
    <main className="space-y-5 animate-fade-in">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6" />Garagem</h1>
        <p className="text-sm text-muted-foreground">Benefício de garagem exclusivo para funcionários cadastrados. Competência, seleção, impressão e histórico de recibos, como VR/VT.</p>
      </header>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">Empresa
          <select className="h-10 w-full rounded-md border bg-background px-2" value={companyId}
            onChange={event => { setCompanyId(event.target.value); setSelectedEmployeeId(''); }}>
            <option value={ALL}>Todas as empresas</option>
            {companies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">Competência
          <Input type="month" value={competencia} onChange={event => {
            setCompetencia(event.target.value); setDataPagamento(event.target.value + '-03'); setLastGenerated('');
          }} />
        </label>
        <label className="space-y-1 text-sm">Data de referência / assinatura
          <Input type="date" value={dataPagamento} onChange={event => setDataPagamento(event.target.value)} />
        </label>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Beneficiários ativos</div><strong className="text-2xl">{shown.length}</strong></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Valor mensal por pessoa</div><strong className="text-2xl">{money(200)}</strong></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Total da seleção</div><strong className="text-2xl">{money(total)}</strong></div>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Funcionários com garagem</h2>
          <Button variant="outline" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCcw className="mr-2 h-4 w-4" />Atualizar
          </Button>
        </div>
        {loading ? <p className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> :
          <div className="space-y-3">
            {shown.map(row => {
              const employee = employeeMap.get(row.employee_id);
              const value = rowEdit[row.employee_id] || { veiculo:row.veiculo, placa:row.placa };
              const edited = value.veiculo !== row.veiculo || value.placa !== row.placa;
              return <div key={row.employee_id} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(180px,1.5fr)_minmax(130px,1fr)_120px_auto] lg:items-end">
                <div><div className="font-semibold">{employee?.name || 'Cadastro não localizado'}</div><div className="text-xs text-muted-foreground">{companyMap.get(row.company_id)?.name} · {employee?.cargo || 'Cargo não informado'}</div></div>
                <label className="text-xs text-muted-foreground">Veículo
                  <Input className="mt-1" value={value.veiculo} onChange={event => setRowEdit(prev => ({...prev,[row.employee_id]:{...value,veiculo:event.target.value}}))} />
                </label>
                <label className="text-xs text-muted-foreground">Placa
                  <Input className="mt-1" value={value.placa} onChange={event => setRowEdit(prev => ({...prev,[row.employee_id]:{...value,placa:event.target.value}}))} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {edited && <Button size="sm" onClick={() => void saveVehicle(row)} disabled={busy}><Save className="mr-1 h-4 w-4" />Salvar</Button>}
                  <Button size="sm" variant="outline" onClick={() => printIndividual(row)} disabled={busy}><Printer className="mr-1 h-4 w-4" />PDF</Button>
                  <Button size="sm" variant="destructive" onClick={() => void deactivate(row)} disabled={busy}><UserMinus className="mr-1 h-4 w-4" />Retirar</Button>
                </div>
              </div>;
            })}
            {!shown.length && <p className="text-sm text-muted-foreground">Nenhum beneficiário ativo nesta empresa.</p>}
          </div>}
      </section>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Plus className="h-5 w-5" />Incluir funcionário</h2>
        <p className="mb-3 text-xs text-muted-foreground">A lista vem exclusivamente do cadastro de funcionários ativos. Não é possível criar funcionário por aqui.</p>
        <div className="grid gap-3 md:grid-cols-[minmax(200px,2fr)_minmax(140px,1fr)_130px_auto] md:items-end">
          <label className="text-xs text-muted-foreground">Funcionário cadastrado
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={selectedEmployeeId} onChange={event => setSelectedEmployeeId(event.target.value)}>
              <option value="">Selecionar funcionário</option>
              {enrollable.map(item => <option key={item.id} value={item.id}>{item.name} · {companyMap.get(item.companyId)?.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Veículo<Input className="mt-1" value={newVehicle} onChange={event => setNewVehicle(event.target.value)} placeholder="Ex.: Fiat Strada" /></label>
          <label className="text-xs text-muted-foreground">Placa<Input className="mt-1" value={newPlate} onChange={event => setNewPlate(event.target.value)} placeholder="ABC1D23" /></label>
          <Button onClick={() => void enroll()} disabled={busy || !selectedEmployeeId}><Plus className="mr-1 h-4 w-4" />Incluir</Button>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5" />Recibos e impressão</h2>
            <p className="mt-1 text-xs text-muted-foreground">Data inicial: dia 3, ajustável para feriados e fins de semana. PDF individual e consolidado; recibos já existentes nunca são sobrescritos.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={printConsolidated} disabled={busy || !reportRows.length}><Printer className="mr-2 h-4 w-4" />Consolidado PDF</Button>
            <Button onClick={() => void generateReceipts()} disabled={busy || !reportRows.length}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Gerar e liberar recibos
            </Button>
          </div>
        </div>
        {lastGenerated && <p className="mt-2 text-xs text-muted-foreground" role="status">{lastGenerated}</p>}
        <p className="mt-3 text-xs text-muted-foreground">Emissão não significa pagamento confirmado; os recibos ficam aguardando assinatura, sem bloquear o fechamento.</p>
      </section>
      {companyId !== ALL
        ? <GarageReceiptAdminModule companyId={companyId} competencia={competencia} dataReferencia={dataPagamento} />
        : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Selecione uma empresa para consultar, imprimir, importar ou enviar os recibos individuais já arquivados na Assinatura Digital.</p>}
    </main>
  );
};

export default GaragemPage;
