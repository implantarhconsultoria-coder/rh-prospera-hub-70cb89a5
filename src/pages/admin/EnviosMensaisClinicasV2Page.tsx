import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CalendarDays, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { EmailPdfModal, EmailPdfDraft } from '@/components/EmailPdfModal';
import { CLINICA_TEMPLATE_BASE64, CLINICA_TEMPLATE_HASH } from '@/lib/clinicaTemplate';
import { toast } from 'sonner';

type Empresa = { id: string; nome: string; razao_social?: string | null; cnpj?: string | null; codigo?: string | null; status?: string | null };
type Funcionario = {
  id: string; empresa_id?: string | null; company_id?: string | null; nome: string; registro?: string | null;
  matricula_esocial?: string | null; cpf?: string | null; rg?: string | null; cargo?: string | null;
  categoria?: string | null; salario?: number | null; data_admissao?: string | null; data_demissao?: string | null;
  data_nascimento?: string | null; setor_ghe?: string | null; telefone?: string | null; celular?: string | null;
  email?: string | null; endereco?: string | null; status?: string | null; ativo?: boolean | null;
};
type Config = {
  id: string; nome: string; email_principal: string; emails_copia: string[]; assunto_padrao: string;
  corpo_padrao: string; assinatura: string; template_hash: string; template_versao: string;
};
type Vinculo = { empresa_id: string; clinica_id: string; regra_nome_arquivo: string };
type Envio = {
  id: string; clinica_id: string; empresa_id: string; competencia: string; tipo_envio: string; status: string;
  quantidade_funcionarios: number; template_hash: string; arquivo_hash: string; arquivo_nome: string; arquivo_url: string;
  destinatarios: string[]; assunto: string; corpo: string; validacao: { items?: string[] } | null; erro: string;
};
type Gerado = { blob: Blob; fileName: string; count: number; hash: string; preview: unknown[][]; validation: string[] };

const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const base64ToArrayBuffer = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
const excelDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`) : null;
const monthKey = (value?: string | null) => value?.slice(0, 7) || '';
const safe = (value: unknown) => String(value ?? '').trim();
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
export const resolveClinicFileName = (rule: string, company: string, competence: string) =>
  (rule || 'Modelo1_{empresa}_{competencia}.xlsx')
    .replaceAll('{empresa}', slug(company))
    .replaceAll('{competencia}', competence)
    .replaceAll('{{empresa}}', slug(company))
    .replaceAll('{{competencia}}', competence);
export const isFinalClinicStatus = (status?: string | null) => status === 'ENVIADO' || status === 'CANCELADO';
const sha256 = async (buffer: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
};

const EnviosMensaisClinicasV2Page: React.FC = () => {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  const [generated, setGenerated] = useState<Record<string, Gerado>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<EmailPdfDraft | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const automaticKey = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [companies, employees, clinic, links, monthly] = await Promise.all([
        supabase.from('empresas').select('id,nome,razao_social,cnpj,codigo,status').eq('status', 'ativa').order('nome'),
        supabase.from('funcionarios').select('id,empresa_id,company_id,nome,registro,matricula_esocial,cpf,rg,cargo,categoria,salario,data_admissao,data_demissao,data_nascimento,setor_ghe,telefone,celular,email,endereco,status,ativo').neq('status', 'excluido').order('nome'),
        supabase.from('clinicas_envio_config').select('*').eq('codigo', 'ponte-aerea').eq('ativo', true).maybeSingle(),
        supabase.from('clinicas_empresa_vinculos').select('empresa_id,clinica_id,regra_nome_arquivo').eq('ativo', true),
        supabase.from('clinicas_envios_mensais').select('*').eq('competencia', competencia).eq('tipo_envio', 'ATUALIZACAO_FUNCIONARIOS'),
      ]);
      const failure = companies.error || employees.error || clinic.error || links.error || monthly.error;
      if (failure) throw failure;
      setEmpresas((companies.data || []) as Empresa[]);
      setFuncionarios((employees.data || []) as Funcionario[]);
      setConfig(clinic.data as Config | null);
      setVinculos((links.data || []) as Vinculo[]);
      setEnvios(Object.fromEntries(((monthly.data || []) as Envio[]).map(row => [row.empresa_id, row])));
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar a central de envios.');
    } finally {
      setLoading(false);
    }
  }, [competencia]);

  useEffect(() => { void load(); }, [load]);

  const rowsByCompany = useMemo(() => {
    const map = new Map<string, Funcionario[]>();
    empresas.forEach(company => map.set(company.id, []));
    funcionarios.forEach(employee => {
      const companyId = employee.empresa_id || employee.company_id || '';
      if (!map.has(companyId)) return;
      const activeAtCutoff = !employee.data_demissao || monthKey(employee.data_demissao) >= competencia;
      if (employee.ativo || activeAtCutoff) map.get(companyId)!.push(employee);
    });
    return map;
  }, [empresas, funcionarios, competencia]);

  const generateWorkbook = useCallback(async (empresa: Empresa): Promise<Gerado> => {
    const employees = rowsByCompany.get(empresa.id) || [];
    if (!employees.length) throw new Error('DADOS INCOMPLETOS — nenhum funcionário elegível nesta competência.');
    if (!config) throw new Error('Clínica não configurada.');
    if (config.template_hash !== CLINICA_TEMPLATE_HASH) throw new Error('PLANILHA REPROVADA — hash do template oficial divergente.');

    const workbook = XLSX.read(base64ToArrayBuffer(CLINICA_TEMPLATE_BASE64), { type: 'array', cellStyles: true, cellDates: true });
    if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'Modelo1') throw new Error('PLANILHA REPROVADA — aba oficial divergente.');
    const worksheet = workbook.Sheets.Modelo1;
    const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, blankrows: false })[0] as string[];
    if (headers.length !== 118) throw new Error(`PLANILHA REPROVADA — ${headers.length} colunas; esperado 118.`);

    const styleRow: Record<number, any> = {};
    for (let column = 0; column < 118; column++) {
      const address = XLSX.utils.encode_cell({ r: 2, c: column });
      styleRow[column] = worksheet[address] ? { ...worksheet[address] } : {};
    }
    Object.keys(worksheet).filter(key => !key.startsWith('!')).forEach(address => {
      if (XLSX.utils.decode_cell(address).r >= 2) delete worksheet[address];
    });

    employees.forEach((employee, index) => {
      const row = index + 2;
      const values: unknown[] = new Array(118).fill(null);
      values[0] = empresa.codigo || '';
      values[1] = empresa.nome;
      values[3] = employee.setor_ghe || '';
      values[5] = employee.cargo || '';
      values[6] = employee.matricula_esocial || employee.registro || '';
      values[7] = employee.registro || '';
      values[8] = employee.nome;
      values[9] = excelDate(employee.data_nascimento);
      values[11] = employee.data_demissao ? 'N' : 'S';
      values[12] = excelDate(employee.data_admissao);
      values[13] = excelDate(employee.data_demissao);
      values[17] = employee.rg || '';
      values[19] = employee.cpf || '';
      values[21] = employee.endereco || '';
      values[26] = employee.telefone || employee.celular || '';
      values[29] = employee.email || '';
      values[38] = empresa.cnpj || '';
      values[48] = empresa.razao_social || empresa.nome;
      values[54] = empresa.cnpj || '';
      values[62] = employee.cargo || '';
      values[73] = employee.celular || employee.telefone || '';
      values[85] = employee.salario ?? null;
      values[87] = employee.celular || '';
      values[92] = employee.categoria || '';
      values[93] = employee.matricula_esocial || employee.registro || '';

      values.forEach((value, column) => {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const base = styleRow[column] || {};
        const cell: any = { ...base };
        delete cell.v; delete cell.w; delete cell.f;
        if (value instanceof Date) { cell.t = 'd'; cell.v = value; cell.z = base.z || 'dd/mm/yyyy'; }
        else if (typeof value === 'number') { cell.t = 'n'; cell.v = value; }
        else { cell.t = 's'; cell.v = value == null ? '' : String(value); }
        if (employee.data_demissao && monthKey(employee.data_demissao) === competencia) {
          cell.s = { ...(cell.s || {}), fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } };
        }
        worksheet[address] = cell;
      });
    });

    worksheet['!ref'] = `A1:DN${Math.max(3, employees.length + 2)}`;
    const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true, compression: true }) as ArrayBuffer;
    const hash = await sha256(output);
    const link = vinculos.find(item => item.empresa_id === empresa.id);
    const fileName = resolveClinicFileName(link?.regra_nome_arquivo || '', empresa.nome, competencia);
    const validation = ['1 aba confirmada', 'Aba Modelo1 confirmada', '118 colunas confirmadas', 'Template oficial confirmado', `${employees.length} funcionários incluídos`];
    const preview = employees.slice(0, 8).map(employee => [employee.nome, employee.cpf, employee.cargo, employee.data_admissao, employee.data_demissao || '']);
    return { blob: new Blob([output], { type: xlsxMime }), fileName, count: employees.length, hash, preview, validation };
  }, [competencia, config, rowsByCompany, vinculos]);

  const persistGenerated = useCallback(async (empresa: Empresa, item: Gerado): Promise<Envio> => {
    if (!config) throw new Error('Clínica não configurada.');
    const current = envios[empresa.id];
    if (isFinalClinicStatus(current?.status)) throw new Error('Competência já finalizada; o arquivo histórico não será regenerado.');
    const path = `${competencia}/${empresa.id}/${item.hash.slice(0, 12)}-${item.fileName}`;
    const upload = await supabase.storage.from('clinicas-envios').upload(path, item.blob, { upsert: true, contentType: xlsxMime });
    if (upload.error) throw upload.error;
    const { data: auth } = await supabase.auth.getUser();
    const subject = config.assunto_padrao.replaceAll('{{empresa}}', empresa.nome).replaceAll('{{competencia}}', competencia);
    const body = `${config.corpo_padrao.replaceAll('{{empresa}}', empresa.nome).replaceAll('{{competencia}}', competencia)}${config.assinatura.trim() ? `\n\n${config.assinatura}` : ''}`;
    const payload = {
      clinica_id: config.id,
      empresa_id: empresa.id,
      competencia,
      tipo_envio: 'ATUALIZACAO_FUNCIONARIOS',
      status: 'PRONTO PARA ENVIAR',
      quantidade_funcionarios: item.count,
      template_hash: CLINICA_TEMPLATE_HASH,
      arquivo_hash: item.hash,
      arquivo_nome: item.fileName,
      arquivo_url: path,
      destinatarios: [config.email_principal, ...(config.emails_copia || [])],
      assunto: subject,
      corpo: body,
      validacao: { items: item.validation, automatico: true },
      erro: '',
      gerado_por: auth.user?.id,
      gerado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = await supabase.from('clinicas_envios_mensais').upsert(payload, { onConflict: 'empresa_id,clinica_id,competencia,tipo_envio' }).select().single();
    if (result.error) throw result.error;
    return result.data as Envio;
  }, [competencia, config, envios]);

  const markFailure = useCallback(async (empresa: Empresa, error: unknown) => {
    const clinic = config;
    if (!clinic) return;
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    await supabase.from('clinicas_envios_mensais').upsert({
      clinica_id: clinic.id,
      empresa_id: empresa.id,
      competencia,
      tipo_envio: 'ATUALIZACAO_FUNCIONARIOS',
      status: message.startsWith('DADOS INCOMPLETOS') ? 'DADOS INCOMPLETOS' : 'ERRO DE GERAÇÃO',
      template_hash: clinic.template_hash,
      destinatarios: [clinic.email_principal, ...(clinic.emails_copia || [])],
      assunto: clinic.assunto_padrao.replaceAll('{{empresa}}', empresa.nome).replaceAll('{{competencia}}', competencia),
      corpo: clinic.corpo_padrao.replaceAll('{{empresa}}', empresa.nome).replaceAll('{{competencia}}', competencia),
      erro: message,
      validacao: { automatico: true, aprovado: false },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'empresa_id,clinica_id,competencia,tipo_envio' });
  }, [competencia, config]);

  const prepareCompany = useCallback(async (empresa: Empresa, silent = false): Promise<boolean> => {
    setBusy(empresa.id);
    try {
      const item = await generateWorkbook(empresa);
      const row = await persistGenerated(empresa, item);
      setGenerated(previous => ({ ...previous, [empresa.id]: item }));
      setEnvios(previous => ({ ...previous, [empresa.id]: row }));
      if (!silent) toast.success(`${empresa.nome}: planilha pronta para envio.`);
      return true;
    } catch (error: any) {
      await markFailure(empresa, error);
      if (!silent) toast.error(error?.message || 'Falha ao preparar a planilha.');
      return false;
    } finally {
      setBusy('');
    }
  }, [generateWorkbook, markFailure, persistGenerated]);

  useEffect(() => {
    if (loading || !config || automaticKey.current === competencia) return;
    const linked = empresas.filter(company => vinculos.some(link => link.empresa_id === company.id));
    const pending = linked.filter(company => {
      const status = envios[company.id]?.status;
      return !['PRONTO PARA ENVIAR', 'ENVIADO', 'CANCELADO'].includes(status || '');
    });
    automaticKey.current = competencia;
    if (!pending.length) return;
    void (async () => {
      for (const company of pending) {
        const ok = await prepareCompany(company, true);
        if (!ok) {
          toast.error(`Preparação automática interrompida em ${company.nome}. As empresas anteriores foram preservadas.`);
          break;
        }
      }
      await load();
    })();
  }, [competencia, config, empresas, envios, loading, load, prepareCompany, vinculos]);

  const getGenerated = useCallback(async (empresa: Empresa): Promise<Gerado> => {
    if (generated[empresa.id]) return generated[empresa.id];
    const row = envios[empresa.id];
    if (!row?.arquivo_url || !row.arquivo_nome) throw new Error('Arquivo ainda não foi preparado.');
    const download = await supabase.storage.from('clinicas-envios').download(row.arquivo_url);
    if (download.error) throw download.error;
    const buffer = await download.data.arrayBuffer();
    const hash = await sha256(buffer);
    if (hash !== row.arquivo_hash || row.template_hash !== CLINICA_TEMPLATE_HASH) throw new Error('ARQUIVO BLOQUEADO — hash histórico divergente.');
    const item: Gerado = {
      blob: download.data,
      fileName: row.arquivo_nome,
      count: row.quantidade_funcionarios,
      hash,
      preview: [],
      validation: row.validacao?.items || ['Arquivo histórico recuperado e validado'],
    };
    setGenerated(previous => ({ ...previous, [empresa.id]: item }));
    return item;
  }, [envios, generated]);

  const downloadFile = async (empresa: Empresa) => {
    try {
      const item = await getGenerated(empresa);
      const url = URL.createObjectURL(item.blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = item.fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) { toast.error(error?.message || 'Não foi possível baixar o arquivo.'); }
  };

  const prepareEmail = async (empresa: Empresa) => {
    try {
      const item = await getGenerated(empresa);
      const row = envios[empresa.id];
      if (!row || row.status !== 'PRONTO PARA ENVIAR') throw new Error('O envio ainda não está aprovado para conferência.');
      setDraft({
        to: [row.destinatarios[0]],
        cc: row.destinatarios.slice(1),
        subject: row.assunto,
        body: row.corpo,
        attachments: [{ attachmentBlob: item.blob, attachmentName: item.fileName, attachmentContentType: xlsxMime, documentName: item.fileName }],
        moduleOrigin: 'envios-clinicas',
        documentName: item.fileName,
        afterSend: async () => {
          const { data: auth } = await supabase.auth.getUser();
          await supabase.from('clinicas_envios_mensais').update({
            status: 'ENVIADO', enviado_em: new Date().toISOString(), enviado_por: auth.user?.id, updated_at: new Date().toISOString(),
          }).eq('id', row.id).eq('status', 'PRONTO PARA ENVIAR');
          await load();
        },
      });
      setEmailOpen(true);
    } catch (error: any) { toast.error(error?.message || 'Não foi possível preparar o e-mail.'); }
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Carregando envios mensais...</div>;

  const linkedCompanies = empresas.filter(company => vinculos.some(link => link.empresa_id === company.id));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-7 w-7" /> Envios mensais para clínicas</h1>
        <p className="text-muted-foreground">As planilhas são preparadas automaticamente. O e-mail só é enviado após sua confirmação.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div><label className="text-sm font-medium">Competência</label><Input type="month" value={competencia} onChange={event => { automaticKey.current = ''; setCompetencia(event.target.value); setGenerated({}); }} /></div>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar dados</Button>
          <div className="text-sm text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" /> A pendência é criada no dia 1º e preparada na primeira abertura da competência.</div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {linkedCompanies.map(empresa => {
          const row = envios[empresa.id];
          const item = generated[empresa.id];
          const count = rowsByCompany.get(empresa.id)?.length || 0;
          const status = row?.status || 'AGUARDANDO GERAÇÃO';
          const ready = status === 'PRONTO PARA ENVIAR';
          return <Card key={empresa.id}>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex justify-between gap-4"><span>{empresa.nome}</span><span className="text-sm font-normal text-muted-foreground">{count} funcionários</span></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div><b>Clínica:</b> {config?.nome || 'Não configurada'}</div>
                <div><b>Para:</b> {row?.destinatarios?.[0] || config?.email_principal || 'Não configurado'}</div>
                <div><b>Status:</b> {busy === empresa.id ? 'EM VALIDAÇÃO' : status}</div>
              </div>
              {row?.erro && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><ShieldAlert className="h-4 w-4 mt-0.5" /> {row.erro}</div>}
              {(item || ready) && <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {ready ? 'Arquivo validado e pronto para envio' : 'Validação estrutural concluída'}</div>
                <div className="text-xs text-muted-foreground">{(item?.validation || row?.validacao?.items || []).join(' • ')}</div>
                {item?.preview?.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Funcionário','CPF','Cargo','Admissão','Demissão'].map(header => <th key={header} className="text-left p-1 border-b">{header}</th>)}</tr></thead><tbody>{item.preview.map((values,index) => <tr key={index}>{values.map((value,column) => <td key={column} className="p-1 border-b">{safe(value)}</td>)}</tr>)}</tbody></table></div> : null}
              </div>}
              <div className="flex flex-wrap gap-2">
                {!isFinalClinicStatus(status) && !ready && <Button onClick={() => void prepareCompany(empresa)} disabled={busy === empresa.id}>
                  {busy === empresa.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Preparar novamente
                </Button>}
                {(ready || status === 'ENVIADO') && <Button variant="outline" onClick={() => void downloadFile(empresa)}><Download className="h-4 w-4 mr-2" /> Baixar planilha</Button>}
                {ready && <Button onClick={() => void prepareEmail(empresa)}><Send className="h-4 w-4 mr-2" /> Conferir e enviar</Button>}
              </div>
            </CardContent>
          </Card>;
        })}
      </div>

      <EmailPdfModal open={emailOpen} draft={draft} onOpenChange={setEmailOpen} />
    </div>
  );
};

export default EnviosMensaisClinicasV2Page;
