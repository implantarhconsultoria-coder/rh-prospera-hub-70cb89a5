import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { CalendarDays, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Send } from 'lucide-react';
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
  corpo_padrao: string; assinatura: string; template_hash: string;
};
type Vinculo = { empresa_id: string; clinica_id: string; regra_nome_arquivo: string };
type Gerado = { blob: Blob; fileName: string; count: number; hash: string; preview: any[][]; validation: string[] };

const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const base64ToArrayBuffer = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
const excelDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`) : null;
const monthKey = (value?: string | null) => value?.slice(0, 7) || '';
const safe = (value: unknown) => String(value ?? '').trim();
const sha256 = async (buffer: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
};
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');

const EnviosMensaisClinicasPage: React.FC = () => {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [generated, setGenerated] = useState<Record<string, Gerado>>({});
  const [draft, setDraft] = useState<EmailPdfDraft | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: es, error: ee }, { data: fs, error: fe }, { data: cs, error: ce }, { data: vs, error: ve }] = await Promise.all([
        supabase.from('empresas').select('id,nome,razao_social,cnpj,codigo,status').eq('status', 'ativa').order('nome'),
        supabase.from('funcionarios').select('id,empresa_id,company_id,nome,registro,matricula_esocial,cpf,rg,cargo,categoria,salario,data_admissao,data_demissao,data_nascimento,setor_ghe,telefone,celular,email,endereco,status,ativo').neq('status', 'excluido').order('nome'),
        supabase.from('clinicas_envio_config').select('*').eq('codigo', 'ponte-aerea').eq('ativo', true).maybeSingle(),
        supabase.from('clinicas_empresa_vinculos').select('empresa_id,clinica_id,regra_nome_arquivo').eq('ativo', true),
      ]);
      if (ee || fe || ce || ve) throw ee || fe || ce || ve;
      setEmpresas((es || []) as Empresa[]);
      setFuncionarios((fs || []) as Funcionario[]);
      setConfig(cs as Config);
      setVinculos((vs || []) as Vinculo[]);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a central de envios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const rowsByCompany = useMemo(() => {
    const map = new Map<string, Funcionario[]>();
    empresas.forEach(e => map.set(e.id, []));
    funcionarios.forEach(f => {
      const id = f.empresa_id || f.company_id || '';
      if (!map.has(id)) return;
      const demitidoDepoisCorte = !f.data_demissao || monthKey(f.data_demissao) >= competencia;
      if (f.ativo || demitidoDepoisCorte) map.get(id)!.push(f);
    });
    return map;
  }, [empresas, funcionarios, competencia]);

  const generate = async (empresa: Empresa): Promise<Gerado> => {
    const employees = rowsByCompany.get(empresa.id) || [];
    const workbook = XLSX.read(base64ToArrayBuffer(CLINICA_TEMPLATE_BASE64), { type: 'array', cellStyles: true, cellDates: true });
    const ws = workbook.Sheets['Modelo1'];
    if (!ws) throw new Error('Template oficial sem a aba Modelo1.');

    const originalHeaders = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1, blankrows: false })[0] as string[];
    if (originalHeaders.length !== 118) throw new Error(`Modelo divergente: ${originalHeaders.length} colunas; esperado 118.`);

    const styleRow: Record<number, any> = {};
    for (let c = 0; c < 118; c++) {
      const addr = XLSX.utils.encode_cell({ r: 2, c });
      styleRow[c] = ws[addr] ? { ...ws[addr] } : {};
    }
    Object.keys(ws).filter(k => !k.startsWith('!')).forEach(addr => {
      const cell = XLSX.utils.decode_cell(addr);
      if (cell.r >= 2) delete ws[addr];
    });

    employees.forEach((f, i) => {
      const row = i + 2;
      const values: any[] = new Array(118).fill(null);
      values[0] = empresa.codigo || '';
      values[1] = empresa.nome;
      values[3] = f.setor_ghe || '';
      values[5] = f.cargo || '';
      values[6] = f.matricula_esocial || f.registro || '';
      values[7] = f.registro || '';
      values[8] = f.nome;
      values[9] = excelDate(f.data_nascimento);
      values[11] = f.data_demissao ? 'N' : 'S';
      values[12] = excelDate(f.data_admissao);
      values[13] = excelDate(f.data_demissao);
      values[17] = f.rg || '';
      values[19] = f.cpf || '';
      values[21] = f.endereco || '';
      values[26] = f.telefone || f.celular || '';
      values[29] = f.email || '';
      values[38] = empresa.cnpj || '';
      values[48] = empresa.razao_social || empresa.nome;
      values[54] = empresa.cnpj || '';
      values[62] = f.cargo || '';
      values[73] = f.celular || f.telefone || '';
      values[85] = f.salario ?? null;
      values[87] = f.celular || '';
      values[92] = f.categoria || '';
      values[93] = f.matricula_esocial || f.registro || '';

      values.forEach((value, c) => {
        const addr = XLSX.utils.encode_cell({ r: row, c });
        const base = styleRow[c] || {};
        const cell: any = { ...base };
        delete cell.v; delete cell.w; delete cell.f;
        if (value instanceof Date) { cell.t = 'd'; cell.v = value; cell.z = base.z || 'dd/mm/yyyy'; }
        else if (typeof value === 'number') { cell.t = 'n'; cell.v = value; }
        else { cell.t = 's'; cell.v = value == null ? '' : String(value); }
        if (f.data_demissao && monthKey(f.data_demissao) === competencia) {
          cell.s = { ...(cell.s || {}), fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } };
        }
        ws[addr] = cell;
      });
    });

    ws['!ref'] = `A1:DN${Math.max(3, employees.length + 2)}`;
    const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true, compression: true });
    const hash = await sha256(out);
    const validation = [
      workbook.SheetNames.length === 1 ? '1 aba confirmada' : 'Quantidade de abas divergente',
      workbook.SheetNames[0] === 'Modelo1' ? 'Aba Modelo1 confirmada' : 'Nome da aba divergente',
      originalHeaders.length === 118 ? '118 colunas confirmadas' : 'Colunas divergentes',
      config?.template_hash === CLINICA_TEMPLATE_HASH ? 'Template oficial confirmado' : 'Hash do template divergente',
      employees.length > 0 ? `${employees.length} funcionários incluídos` : 'Nenhum funcionário encontrado',
    ];
    if (validation.some(v => v.includes('divergente')) || employees.length === 0) throw new Error(`PLANILHA REPROVADA — MODELO DIVERGENTE: ${validation.join('; ')}`);

    const fileName = `Modelo1_${slug(empresa.nome)}_${competencia}.xlsx`;
    const blob = new Blob([out], { type: xlsxMime });
    const preview = employees.slice(0, 8).map(f => [f.nome, f.cpf, f.cargo, f.data_admissao, f.data_demissao || '']);
    return { blob, fileName, count: employees.length, hash, preview, validation };
  };

  const handleGenerate = async (empresa: Empresa) => {
    setBusy(empresa.id);
    try {
      const item = await generate(empresa);
      setGenerated(prev => ({ ...prev, [empresa.id]: item }));
      const { data: auth } = await supabase.auth.getUser();
      const path = `${competencia}/${empresa.id}/${item.hash.slice(0, 12)}-${item.fileName}`;
      const { error: uploadError } = await supabase.storage.from('clinicas-envios').upload(path, item.blob, { upsert: true, contentType: xlsxMime });
      if (uploadError) throw uploadError;
      const clinic = config;
      if (!clinic) throw new Error('Clínica não configurada.');
      const subject = clinic.assunto_padrao.replace('{{empresa}}', empresa.nome).replace('{{competencia}}', competencia);
      const body = `${clinic.corpo_padrao.replace('{{empresa}}', empresa.nome).replace('{{competencia}}', competencia)}\n\n${clinic.assinatura}`;
      const { error: saveError } = await supabase.from('clinicas_envios_mensais').upsert({
        clinica_id: clinic.id, empresa_id: empresa.id, competencia, status: 'PRONTO PARA ENVIAR',
        quantidade_funcionarios: item.count, template_hash: CLINICA_TEMPLATE_HASH, arquivo_hash: item.hash,
        arquivo_nome: item.fileName, arquivo_url: path, destinatarios: [clinic.email_principal, ...(clinic.emails_copia || [])],
        assunto: subject, corpo: body, validacao: { items: item.validation }, gerado_por: auth.user?.id, gerado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,clinica_id,competencia,tipo_envio' });
      if (saveError) throw saveError;
      toast.success('Planilha validada e pronta para envio.');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar a planilha.');
    } finally {
      setBusy('');
    }
  };

  const download = (item: Gerado) => {
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a'); a.href = url; a.download = item.fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const prepareEmail = (empresa: Empresa, item: Gerado) => {
    if (!config) return;
    const subject = config.assunto_padrao.replace('{{empresa}}', empresa.nome).replace('{{competencia}}', competencia);
    const body = `${config.corpo_padrao.replace('{{empresa}}', empresa.nome).replace('{{competencia}}', competencia)}\n\n${config.assinatura}`;
    setDraft({
      to: [config.email_principal], cc: config.emails_copia || [], subject, body,
      attachments: [{ attachmentBlob: item.blob, attachmentName: item.fileName, attachmentContentType: xlsxMime, documentName: item.fileName }],
      moduleOrigin: 'envios-clinicas', documentName: item.fileName,
      afterSend: async () => {
        await supabase.from('clinicas_envios_mensais').update({ status: 'ENVIADO', enviado_em: new Date().toISOString() })
          .eq('empresa_id', empresa.id).eq('clinica_id', config.id).eq('competencia', competencia);
      },
    });
    setEmailOpen(true);
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Carregando envios mensais...</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-7 w-7" /> Envios mensais para clínicas</h1>
        <p className="text-muted-foreground">Geração controlada do Modelo 1 oficial. Nenhum envio ocorre sem confirmação.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div><label className="text-sm font-medium">Competência</label><Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated({}); }} /></div>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar dados</Button>
          <div className="text-sm text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Pendências são preparadas no dia 1º e permanecem até confirmação.</div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {empresas.filter(e => vinculos.some(v => v.empresa_id === e.id)).map(empresa => {
          const item = generated[empresa.id];
          const count = rowsByCompany.get(empresa.id)?.length || 0;
          return <Card key={empresa.id}>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex justify-between gap-4"><span>{empresa.nome}</span><span className="text-sm font-normal text-muted-foreground">{count} funcionários</span></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div><b>Clínica:</b> {config?.nome}</div>
                <div><b>Para:</b> {config?.email_principal}</div>
                <div><b>Status:</b> {item ? 'PRONTO PARA ENVIAR' : 'AGUARDANDO GERAÇÃO'}</div>
              </div>
              {item && <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Validação estrutural concluída</div>
                <div className="text-xs text-muted-foreground">{item.validation.join(' • ')}</div>
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Funcionário','CPF','Cargo','Admissão','Demissão'].map(h => <th key={h} className="text-left p-1 border-b">{h}</th>)}</tr></thead><tbody>{item.preview.map((r,i) => <tr key={i}>{r.map((v,j) => <td key={j} className="p-1 border-b">{safe(v)}</td>)}</tr>)}</tbody></table></div>
              </div>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleGenerate(empresa)} disabled={busy === empresa.id}>
                  {busy === empresa.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  {item ? 'Gerar novamente' : 'Gerar e validar'}
                </Button>
                {item && <Button variant="outline" onClick={() => download(item)}><Download className="h-4 w-4 mr-2" /> Baixar planilha</Button>}
                {item && <Button onClick={() => prepareEmail(empresa, item)}><Send className="h-4 w-4 mr-2" /> Conferir e enviar</Button>}
              </div>
            </CardContent>
          </Card>;
        })}
      </div>

      <EmailPdfModal open={emailOpen} draft={draft} onOpenChange={setEmailOpen} />
    </div>
  );
};

export default EnviosMensaisClinicasPage;
