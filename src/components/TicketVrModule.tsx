import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, RefreshCw, Save, Settings2, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/calculations';
import { buildTicketVrTxt, downloadTicketTxt, sha256, ticketVrPreflight, type TicketVrConfig, type TicketVrRow } from '@/lib/ticketVr';

const emptyConfig = (): TicketVrConfig => ({ codigoClienteTicket: '', unidadeEntrega: '', departamento: 'DEPARTAMENTO', tipoLogradouro: 'R', logradouro: '', numero: '', cidade: '', bairro: '', cep: '', uf: '', interlocutor: '', ddd: '', telefone: '' });
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const workingDates = (competencia: string) => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return [] as string[];
  const count = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return dates;
};
const brDate = (iso: string) => iso?.match(/^\d{4}-\d{2}-\d{2}$/) ? iso.split('-').reverse().join('/') : iso;
const configFromRow = (row: any): TicketVrConfig => ({ codigoClienteTicket: String(row?.codigo_cliente_ticket || ''), unidadeEntrega: String(row?.unidade_entrega || ''), departamento: String(row?.departamento || 'DEPARTAMENTO'), tipoLogradouro: String(row?.tipo_logradouro || 'R'), logradouro: String(row?.logradouro || ''), numero: String(row?.numero || ''), cidade: String(row?.cidade || ''), bairro: String(row?.bairro || ''), cep: String(row?.cep || ''), uf: String(row?.uf || ''), interlocutor: String(row?.interlocutor || ''), ddd: String(row?.ddd || ''), telefone: String(row?.telefone || '') });
const configPayload = (config: TicketVrConfig, companyId: string, userId?: string) => ({ company_id: companyId, codigo_cliente_ticket: config.codigoClienteTicket.trim(), unidade_entrega: config.unidadeEntrega.trim(), departamento: config.departamento.trim() || 'DEPARTAMENTO', tipo_logradouro: config.tipoLogradouro.trim() || 'R', logradouro: config.logradouro.trim(), numero: config.numero.trim(), cidade: config.cidade.trim(), bairro: config.bairro.trim(), cep: digits(config.cep), uf: config.uf.trim().toUpperCase(), interlocutor: config.interlocutor.trim(), ddd: digits(config.ddd), telefone: digits(config.telefone), atualizado_por: userId || null, updated_at: new Date().toISOString() });

const employeeIsEligibleForTicket = (employee: any) => {
  const status = String(employee?.status || '').trim().toLowerCase();
  if (employee?.ativo === false) return false;
  if (['desligado', 'excluido', 'inativo', 'demitido'].includes(status)) return false;
  return true;
};

type TicketCompany = { id: string; nome: string; razao_social?: string; cnpj?: string; codigo?: string; status?: string };

const TicketVrModule: React.FC = () => {
  const [accessAuthorized, setAccessAuthorized] = useState(false);
  const [companies, setCompanies] = useState<TicketCompany[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [loadedKey, setLoadedKey] = useState('');
  const [company, setCompany] = useState<any>(null);
  const [rows, setRows] = useState<TicketVrRow[]>([]);
  const [config, setConfig] = useState<TicketVrConfig>(emptyConfig());
  const [configOpen, setConfigOpen] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [approvedId, setApprovedId] = useState('');
  const [approvedVersion, setApprovedVersion] = useState(0);
  const [history, setHistory] = useState<any[]>([]);

  const currentKey = `${companyId}|${competencia}`;
  const hasLoadedData = Boolean(loadedKey && loadedKey === currentKey && company);

  const clearLoadedData = () => {
    setLoadedKey('');
    setCompany(null);
    setRows([]);
    setConfig(emptyConfig());
    setConfigOpen(false);
    setApprovedId('');
    setApprovedVersion(0);
    setHistory([]);
  };

  const authorizeAccess = async () => {
    setLoadingAccess(true);
    try {
      const { data, error } = await (supabase as any).from('empresas').select('id,nome,razao_social,cnpj,codigo,status').order('nome');
      if (error) throw error;
      const allowed = (data || []).filter((item: any) => {
        const text = `${item.nome || ''} ${item.codigo || ''}`.toLowerCase();
        return !text.includes('goian') && !text.includes('gyn') && item.status !== 'inativa';
      });
      setCompanies(allowed);
      setCompanyId((current) => current || allowed[0]?.id || '');
      setAccessAuthorized(true);
      toast.success('Acesso aos dados do Ticket autorizado. Nenhum cálculo foi executado ainda.');
    } catch (error: any) {
      toast.error(`Não foi possível autorizar o módulo Ticket: ${error?.message || 'erro inesperado'}`);
    } finally {
      setLoadingAccess(false);
    }
  };

  const load = async () => {
    if (!accessAuthorized || !companyId || !competencia) return;
    setLoading(true);
    clearLoadedData();
    try {
      const [{ data: companyData, error: companyError }, { data: employeeData, error: employeeError }, { data: launchData, error: launchError }, { data: configData, error: configError }, { data: historyData, error: historyError }] = await Promise.all([
        (supabase as any).from('empresas').select('id,nome,razao_social,cnpj,codigo,status').eq('id', companyId).single(),
        (supabase as any).from('funcionarios').select('id,nome,cpf,data_nascimento,data_admissao,data_demissao,vr_ativo,vr_diario,status,ativo,company_id,empresa_id').or(`company_id.eq.${companyId},empresa_id.eq.${companyId}`).eq('vr_ativo', true).eq('ativo', true),
        (supabase as any).from('lancamentos_mensais').select('funcionario_id,competencia,faltas_dias,faltas_datas,observacoes,vr_dias,he50,he100').eq('company_id', companyId).eq('competencia', competencia).is('apagado_em', null),
        (supabase as any).from('ticket_vr_configuracoes').select('*').eq('company_id', companyId).maybeSingle(),
        (supabase as any).from('ticket_vr_geracoes').select('id,competencia,versao,status,total_funcionarios,total_dias_vr,valor_total,nome_arquivo,checksum_sha256,created_at').eq('company_id', companyId).eq('competencia', competencia).order('versao', { ascending: false }).limit(20),
      ]);
      if (companyError) throw companyError;
      if (employeeError) throw employeeError;
      if (launchError) throw launchError;
      if (configError) throw configError;
      if (historyError) throw historyError;

      const monthDates = workingDates(competencia);
      const monthStart = `${competencia}-01`;
      const [year, month] = competencia.split('-').map(Number);
      const monthEnd = `${competencia}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      const launchByEmployee = new Map((launchData || []).map((item: any) => [item.funcionario_id, item]));
      const calculated = (employeeData || []).filter((employee: any) => {
        if (!employeeIsEligibleForTicket(employee)) return false;
        const admission = String(employee.data_admissao || '');
        const dismissal = String(employee.data_demissao || '');
        return (!admission || admission <= monthEnd) && (!dismissal || dismissal >= monthStart);
      }).map((employee: any) => {
        const launch: any = launchByEmployee.get(employee.id) || {};
        const validWorkDates = monthDates.filter((date) => (!employee.data_admissao || date >= employee.data_admissao) && (!employee.data_demissao || date <= employee.data_demissao));
        const rawAbsenceDates = Array.isArray(launch.faltas_datas) ? launch.faltas_datas.map(String) : [];
        const absenceDates = Array.from(new Set(rawAbsenceDates.filter((date: string) => date.startsWith(competencia) && validWorkDates.includes(date)))).sort();
        const declaredAbsences = Math.max(0, Number(launch.faltas_dias || 0));
        const paidDays = Math.max(0, validWorkDates.length - absenceDates.length);
        const daily = Number(employee.vr_diario || 0);
        const pending: string[] = [];
        if (daily <= 0) pending.push('VALOR DE VR NÃO CADASTRADO');
        if (digits(employee.cpf).length !== 11) pending.push('CPF OBRIGATÓRIO AUSENTE/INVÁLIDO');
        if (!employee.data_nascimento) pending.push('DATA DE NASCIMENTO EXIGIDA PELO LAYOUT TICKET');
        if (declaredAbsences > absenceDates.length) pending.push('FALTA REGISTRADA SEM TODAS AS DATAS');
        return { id: employee.id, nome: employee.nome, cpf: employee.cpf || '', dataNascimento: employee.data_nascimento || '', valorDiario: daily, diasUteis: validWorkDates.length, faltasDatas: absenceDates, diasPagos: paidDays, total: Number((daily * paidDays).toFixed(2)), pendencias: pending } as TicketVrRow;
      }).sort((a: TicketVrRow, b: TicketVrRow) => a.nome.localeCompare(b.nome, 'pt-BR'));

      setCompany(companyData);
      setConfig(configData ? configFromRow(configData) : emptyConfig());
      setHistory(historyData || []);
      setRows(calculated);
      setLoadedKey(currentKey);
      toast.success('Dados do Ticket carregados somente com funcionários ativos. Desligados e excluídos foram ignorados.');
    } catch (error: any) {
      toast.error(`Não foi possível calcular o Ticket VR: ${error?.message || 'erro inesperado'}`);
    } finally {
      setLoading(false);
    }
  };

  const preflight = useMemo(() => hasLoadedData ? ticketVrPreflight({ cnpj: company.cnpj, nome: company.nome }, config, rows) : [], [hasLoadedData, company, config, rows]);
  const total = hasLoadedData ? rows.reduce((sum, row) => sum + row.total, 0) : 0;
  const totalDays = hasLoadedData ? rows.reduce((sum, row) => sum + row.diasPagos, 0) : 0;

  const saveConfig = async () => {
    if (!hasLoadedData || !companyId) return;
    setSavingConfig(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from('ticket_vr_configuracoes').upsert(configPayload(config, companyId, auth.user?.id), { onConflict: 'company_id' });
      if (error) throw error;
      toast.success('Configuração Ticket salva. O cálculo atual foi mantido; nenhum dado adicional foi puxado.');
      setConfigOpen(false);
    } catch (error: any) {
      toast.error(`Erro ao salvar configuração Ticket: ${error?.message || 'falha'}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const printReport = () => {
    if (!hasLoadedData || !company) return;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Libere pop-ups para gerar o PDF.');
    const rowsHtml = rows.map((row) => `<tr><td>${row.nome}</td><td>${formatCurrency(row.valorDiario)}</td><td>${row.diasUteis}</td><td>${row.faltasDatas.length ? row.faltasDatas.map(brDate).join(', ') : 'Nenhuma'}</td><td>${row.diasPagos}</td><td>${formatCurrency(row.total)}</td><td>${row.pendencias.length ? row.pendencias.join(' / ') : 'OK'}</td></tr>`).join('');
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Conferência VR Ticket</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial;color:#111;font-size:11px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.total{margin-top:14px;font-size:16px;font-weight:800}.pending{color:#b91c1c}.toolbar{margin-bottom:12px}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><h1>CONFERÊNCIA DE VR — TICKET</h1><h2>${company.nome} · CNPJ ${company.cnpj || 'PENDENTE'} · Competência ${competencia}</h2><table><thead><tr><th>Funcionário</th><th>VR/Dia</th><th>Dias úteis</th><th>Ocorrências/descontos</th><th>Dias pagos</th><th>Total</th><th>Validação</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="total">TOTAL DA EMPRESA: ${formatCurrency(total)} · ${rows.length} funcionários · ${totalDays} dias VR</div>${preflight.length ? `<p class="pending"><b>PENDÊNCIAS:</b> ${preflight.join(' | ')}</p>` : '<p><b>PREFLIGHT: OK</b></p>'}</body></html>`);
    win.document.close();
    win.focus();
  };

  const loadHistoryOnly = async () => {
    if (!hasLoadedData) return;
    const { data } = await (supabase as any).from('ticket_vr_geracoes').select('id,competencia,versao,status,total_funcionarios,total_dias_vr,valor_total,nome_arquivo,checksum_sha256,created_at').eq('company_id', companyId).eq('competencia', competencia).order('versao', { ascending: false }).limit(20);
    setHistory(data || []);
  };

  const approve = async () => {
    if (!hasLoadedData || !company) return;
    if (preflight.length) return toast.error('Corrija as pendências antes de aprovar a conferência.');
    try {
      const previous = history.find((item) => ['APROVADO', 'TXT GERADO'].includes(item.status));
      const version = Math.max(1, Number(history[0]?.versao || 0) + 1);
      if (previous && !window.confirm('Já existe arquivo aprovado/gerado para esta empresa e competência. Criar NOVA VERSÃO mantendo o histórico anterior?')) return;
      const { data: auth } = await supabase.auth.getUser();
      const snapshot = { company, competencia, config, rows, total, totalDays, preflight, calculadoEm: new Date().toISOString(), regra: 'Somente funcionários ativos com VR ativo; desligados/excluídos são ignorados. VR diário do cadastro × dias úteis individuais − faltas com data; HE não gera VR' };
      const { data, error } = await (supabase as any).from('ticket_vr_geracoes').insert({ company_id: companyId, empresa_nome: company.nome, cnpj: company.cnpj, competencia, versao: version, status: 'APROVADO', total_funcionarios: rows.length, total_dias_vr: totalDays, valor_total: total, snapshot, gerado_por_user_id: auth.user?.id || null, gerado_por_nome: auth.user?.email || null, aprovado_em: new Date().toISOString() }).select('id,versao').single();
      if (error) throw error;
      setApprovedId(data.id);
      setApprovedVersion(data.versao);
      toast.success(`Conferência aprovada — versão ${data.versao}. Agora clique em GERAR ARQUIVO TXT TICKET.`);
      await loadHistoryOnly();
    } catch (error: any) {
      toast.error(`Não foi possível aprovar: ${error?.message || 'falha'}`);
    }
  };

  const generateTxt = async () => {
    if (!hasLoadedData || !approvedId || !company) return;
    if (preflight.length) return toast.error('O cálculo possui pendências e o TXT foi bloqueado.');
    if (!rows.length) return toast.error('Nenhum funcionário ativo disponível para gerar o TXT.');
    try {
      const txt = buildTicketVrTxt({ nome: company.razao_social || company.nome, cnpj: company.cnpj }, competencia, config, rows);
      const checksum = await sha256(txt);
      const safeCompany = String(company.nome || 'EMPRESA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const filename = `TICKET_VR_${safeCompany}_${competencia.replace('-', '')}_V${approvedVersion}.TXT`;
      const { error } = await (supabase as any).from('ticket_vr_geracoes').update({ status: 'TXT GERADO', nome_arquivo: filename, checksum_sha256: checksum, txt_conteudo: txt, txt_gerado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', approvedId);
      if (error) throw error;
      downloadTicketTxt(txt, filename);
      toast.success(`Arquivo TXT Ticket gerado: ${filename}`);
      await loadHistoryOnly();
    } catch (error: any) {
      toast.error(`TXT não gerado: ${error?.message || 'falha estrutural'}`);
    }
  };

  return <div className="card-premium p-5 space-y-4 border-l-4 border-primary">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase text-muted-foreground flex items-center gap-2"><UtensilsCrossed className="w-4 h-4"/>Fechamento / Benefícios / VR</p>
        <h2 className="text-lg font-bold">TICKET — GERAR ARQUIVO VR</h2>
        <p className="text-xs text-muted-foreground">Somente funcionários ativos entram no arquivo. Desligados e excluídos são ignorados mesmo que o VR esteja marcado como ativo. Goiânia permanece fora deste módulo.</p>
      </div>
      {hasLoadedData && <Button variant="outline" onClick={() => setConfigOpen((value) => !value)}><Settings2 className="w-4 h-4 mr-2"/>Configuração Ticket</Button>}
    </div>

    {!accessAuthorized ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center space-y-3">
      <ShieldCheck className="w-8 h-8 mx-auto text-primary"/>
      <div><p className="font-bold">Nenhum dado do Ticket foi puxado.</p><p className="text-xs text-muted-foreground mt-1">A leitura só começa quando você autorizar.</p></div>
      <Button disabled={loadingAccess} onClick={() => void authorizeAccess()}>{loadingAccess ? 'Autorizando...' : 'Autorizar acesso aos dados do Ticket'}</Button>
    </div> : <>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); clearLoadedData(); }} className="border rounded-lg bg-background px-3 py-2 text-sm min-w-64">
          {companies.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
        <Input type="month" value={competencia} onChange={(event) => { setCompetencia(event.target.value); clearLoadedData(); }} className="w-48"/>
        <Button disabled={loading || !companyId} onClick={() => void load()}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}/>{loading ? 'Puxando dados...' : 'Autorizar e puxar dados'}</Button>
        {!hasLoadedData && <span className="text-xs text-muted-foreground">Selecionar empresa/mês não dispara consulta.</span>}
      </div>

      {hasLoadedData && <>
        {configOpen && <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
          <p className="text-sm font-bold">Configuração estrutural Ticket — por CNPJ</p>
          <p className="text-xs text-muted-foreground">Salvar configuração não refaz nem repuxa o cálculo.</p>
          <div className="grid md:grid-cols-3 gap-2"><Cfg label="Código Cliente Ticket (10 posições)" value={config.codigoClienteTicket} set={(v) => setConfig({...config,codigoClienteTicket:v})}/><Cfg label="Unidade de entrega" value={config.unidadeEntrega} set={(v) => setConfig({...config,unidadeEntrega:v})}/><Cfg label="Departamento" value={config.departamento} set={(v) => setConfig({...config,departamento:v})}/><Cfg label="Logradouro" value={config.logradouro} set={(v) => setConfig({...config,logradouro:v})}/><Cfg label="Número" value={config.numero} set={(v) => setConfig({...config,numero:v})}/><Cfg label="Cidade" value={config.cidade} set={(v) => setConfig({...config,cidade:v})}/><Cfg label="Bairro" value={config.bairro} set={(v) => setConfig({...config,bairro:v})}/><Cfg label="CEP" value={config.cep} set={(v) => setConfig({...config,cep:v})}/><Cfg label="UF" value={config.uf} set={(v) => setConfig({...config,uf:v})}/><Cfg label="Interlocutor" value={config.interlocutor} set={(v) => setConfig({...config,interlocutor:v})}/><Cfg label="DDD" value={config.ddd} set={(v) => setConfig({...config,ddd:v})}/><Cfg label="Telefone" value={config.telefone} set={(v) => setConfig({...config,telefone:v})}/></div>
          <Button disabled={savingConfig} onClick={() => void saveConfig()}><Save className="w-4 h-4 mr-2"/>{savingConfig ? 'Salvando...' : 'Salvar configuração'}</Button>
        </div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Kpi label="Funcionários ativos" value={String(rows.length)}/><Kpi label="Dias VR" value={String(totalDays)}/><Kpi label="Total empresa" value={formatCurrency(total)}/><Kpi label="Preflight" value={preflight.length ? `${preflight.length} pendência(s)` : 'VALIDADO'} danger={preflight.length > 0}/></div>

        {preflight.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="font-bold text-sm flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-600"/>Pendências antes do TXT</p><ul className="mt-2 text-xs space-y-1 list-disc pl-5">{preflight.map((item) => <li key={item}>{item}</li>)}</ul></div>}

        <div className="overflow-x-auto max-h-[460px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b">{['Funcionário','VR/Dia','Dias úteis','Ocorrências/descontos','Dias pagos','Total','Status'].map((head) => <th key={head} className="p-2 text-left whitespace-nowrap">{head}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b"><td className="p-2 font-medium whitespace-nowrap">{row.nome}</td><td className="p-2">{formatCurrency(row.valorDiario)}</td><td className="p-2">{row.diasUteis}</td><td className="p-2">{row.faltasDatas.length ? `Falta injustificada — ${row.faltasDatas.map(brDate).join(' / ')}` : 'Nenhuma'}</td><td className="p-2 font-bold">{row.diasPagos}</td><td className="p-2 font-bold">{formatCurrency(row.total)}</td><td className="p-2">{row.pendencias.length ? <span className="text-destructive font-bold">PENDÊNCIA — {row.pendencias.join(' / ')}</span> : <span className="text-success font-bold">OK</span>}</td></tr>)}</tbody></table></div>

        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={printReport}><FileDown className="w-4 h-4 mr-2"/>Gerar relatório PDF</Button><Button disabled={preflight.length > 0 || loading || !rows.length} onClick={() => void approve()}><CheckCircle2 className="w-4 h-4 mr-2"/>Aprovar conferência</Button><Button disabled={!approvedId || preflight.length > 0 || !rows.length} onClick={() => void generateTxt()}><FileDown className="w-4 h-4 mr-2"/>Gerar arquivo TXT Ticket</Button></div>

        {history.length > 0 && <div className="rounded-xl border p-3"><p className="text-xs font-bold uppercase text-muted-foreground mb-2">Histórico desta competência</p><div className="space-y-1 text-xs">{history.map((item) => <div key={item.id} className="flex flex-wrap gap-x-3"><b>V{item.versao}</b><span>{item.status}</span><span>{item.total_funcionarios} funcionários</span><span>{formatCurrency(Number(item.valor_total || 0))}</span>{item.nome_arquivo && <span>{item.nome_arquivo}</span>}</div>)}</div></div>}
      </>}
    </>}
  </div>;
};

const Cfg = ({ label, value, set }: { label: string; value: string; set: (value: string) => void }) => <label className="text-xs"><span className="block mb-1 text-muted-foreground">{label}</span><Input value={value} onChange={(event) => set(event.target.value)} /></label>;
const Kpi = ({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) => <div className="rounded-lg border p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-sm font-bold ${danger ? 'text-destructive' : ''}`}>{value}</p></div>;

export default TicketVrModule;