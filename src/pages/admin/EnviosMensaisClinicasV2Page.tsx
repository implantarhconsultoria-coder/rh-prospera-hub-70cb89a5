import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { EmailPdfDraft, EmailPdfModal } from '@/components/EmailPdfModal';
import { toast } from 'sonner';

type Empresa = { id: string; nome: string; status?: string | null };
type Funcionario = {
  id: string;
  empresa_id?: string | null;
  company_id?: string | null;
  nome: string;
  registro?: string | null;
  matricula_esocial?: string | null;
  status?: string | null;
  ativo?: boolean | null;
  data_admissao?: string | null;
  data_demissao?: string | null;
};
type Gerado = { blob: Blob; fileName: string; count: number; alterados: number; preview: string[][] };

const DESTINATARIO = 'socmail@soc.com.br';
const COPIA_FIXA = 'contato.riva@hotmail.com';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const competenciaDe = (value?: string | null) => value?.slice(0, 7) || '';
const nomeArquivo = (empresa: string, competencia: string) =>
  `Modelo1_${empresa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_')}_${competencia}.xlsx`;
const dataExcel = (value?: string | null) => value ? new Date(`${value}T12:00:00`) : null;

const HEADERS = [
  'Cod.Unid','Nome Unidade','Cod.Setor','Nome Setor','Cod.Cargo','Nome Cargo','Matrícula','Cod Funcionário','Nome Funcionário','Dt.Nascimento','Sexo','Situação','Dt.Admissão','Dt.Demissão','Estado Civil','Pis/Pasep','Contratação','Rg','UF-RG','CPF','CTPS','Endereço','Bairro','Cidade','UF','Cep','Tel','Naturalidade','Cor','E-mail','Deficiencia','CBO','GFIP','Endereço Unidade','Bairro Unidade','Cidade Unidade','Estado Unidade','Cep Unidade','CNPJ Unidade','Inscrição Unidade','Tel1 Unidade','Tel2 Unidade','Tel3 Unidade','Tel4 Unidade','Contato Unid','Cnae','Número Endereço Funcionário','Complemento Endereço Funcionário','Razão Social Unid.','Nome da Mae do Funcionário','Cod. Centro Custo','Dt. Ultima Movimentação','Cod. Unidade contratante','Razão Social','CNPJ','Turno','Dt.Emissão.Cart.Prof','Série CTPS','CNAE 2.0','CNAE Livre','Descrição CNAE Livre','CEI','Função','CNAE 7','Tipo de CNAE Utilizado','Descrição Detalhada do Cargo','Nº endereço Unidade','Complemento endereço Unidade','Regime de Revezamento','Campo Livre 1','Campo Livre 1','Campo Livre 2','Campo Livre 3','Telefone SMS','Grau de Risco','UF CTPS','Nome Centro Custo','Autoriza SMS','Endereço Cobrança Unidade','Número Endereço Cobrança Unidade','Bairro Cobrança Unidade','Cidade Cobrança Unidade','Estado Cobrança Unidade','Cep Cobrança Unidade','Complemento Endereço Cobrança Unidade','Remuneração Mensal (R$)','Telefone Comercial','Telefone Celular','Data Emissão do RG','Código do País de Nascimento','Origem Descrição Detalhada','Unidade Contratante','Escolaridade','Categoria (eSocial)','Matrícula RH','Gênero','Nome Social','Tipo de Admissão','Grau de Instrução','Nome do Pai','Tipo de Vínculo','Nome do Turno','Campo livre 4','CPF Unidade','CAEPF Unidade','Tipo Sanguíneo','Data Inicio Periodo Aquisitivo','Data Fim Periodo Aquisitivo','CNO Unidade','Desconsiderar para o eSocial','Dt. Validade RG','Desconsiderar Unidade para o eSocial','Data Final da Estabilidade','Observação Estabilidade','Função na Brigada','Cod. Empresa do gestor','Identificação do Gestor','Nome do gestor'
];

const EnviosMensaisClinicasV2Page: React.FC = () => {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [generated, setGenerated] = useState<Record<string, Gerado>>({});
  const [draft, setDraft] = useState<EmailPdfDraft | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const [companies, employees] = await Promise.all([
        supabase.from('empresas').select('id,nome,status').eq('status', 'ativa').order('nome'),
        supabase.from('funcionarios').select('id,empresa_id,company_id,nome,registro,matricula_esocial,status,ativo,data_admissao,data_demissao').neq('status', 'excluido').order('nome'),
      ]);
      if (companies.error || employees.error) throw companies.error || employees.error;
      setEmpresas((companies.data || []) as Empresa[]);
      setFuncionarios((employees.data || []) as Funcionario[]);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const porEmpresa = useMemo(() => {
    const result = new Map<string, Funcionario[]>();
    empresas.forEach(empresa => result.set(empresa.id, []));
    funcionarios.forEach(funcionario => {
      const empresaId = funcionario.empresa_id || funcionario.company_id || '';
      if (!result.has(empresaId)) return;
      const admitidoNoMes = competenciaDe(funcionario.data_admissao) === competencia;
      const demitidoNoMes = competenciaDe(funcionario.data_demissao) === competencia;
      const ativo = funcionario.ativo === true || (!funcionario.data_demissao && funcionario.status !== 'desligado');
      if (ativo || admitidoNoMes || demitidoNoMes) result.get(empresaId)!.push(funcionario);
    });
    return result;
  }, [empresas, funcionarios, competencia]);

  const gerar = async (empresa: Empresa) => {
    setBusy(empresa.id);
    try {
      const lista = porEmpresa.get(empresa.id) || [];
      if (!lista.length) throw new Error('Nenhum funcionário encontrado para esta empresa e competência.');

      const rows: any[][] = [['Modelo 1', ...new Array(117).fill(null)], HEADERS];
      let alterados = 0;
      lista.forEach(funcionario => {
        const row = new Array(118).fill(null);
        row[6] = funcionario.matricula_esocial || funcionario.registro || '';
        row[7] = funcionario.registro || '';
        row[8] = funcionario.nome;
        row[11] = funcionario.status || (funcionario.data_demissao ? 'INATIVO' : 'ATIVO');
        row[12] = dataExcel(funcionario.data_admissao);
        row[13] = dataExcel(funcionario.data_demissao);
        const alterado = competenciaDe(funcionario.data_admissao) === competencia || competenciaDe(funcionario.data_demissao) === competencia;
        if (alterado) alterados += 1;
        rows.push(row);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
      worksheet['!ref'] = `A1:DN${rows.length}`;
      worksheet['!cols'] = HEADERS.map((header, index) => ({ wch: index === 8 ? 34 : Math.min(Math.max(header.length + 2, 12), 24) }));
      HEADERS.forEach((_, column) => {
        const address = XLSX.utils.encode_cell({ r: 1, c: column });
        if (worksheet[address]) worksheet[address].s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'D9EAF7' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      });
      lista.forEach((funcionario, index) => {
        const alterado = competenciaDe(funcionario.data_admissao) === competencia || competenciaDe(funcionario.data_demissao) === competencia;
        if (!alterado) return;
        for (let column = 0; column < 118; column++) {
          const address = XLSX.utils.encode_cell({ r: index + 2, c: column });
          if (!worksheet[address]) worksheet[address] = { t: 's', v: '' };
          worksheet[address].s = { ...(worksheet[address].s || {}), fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } };
        }
      });
      [12, 13].forEach(column => {
        lista.forEach((_, index) => {
          const address = XLSX.utils.encode_cell({ r: index + 2, c: column });
          if (worksheet[address]?.v) worksheet[address].z = 'dd/mm/yyyy';
        });
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo1');
      const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true, compression: true }) as ArrayBuffer;
      const fileName = nomeArquivo(empresa.nome, competencia);
      const item: Gerado = {
        blob: new Blob([output], { type: MIME }),
        fileName,
        count: lista.length,
        alterados,
        preview: lista.slice(0, 10).map(f => [f.matricula_esocial || f.registro || '', f.registro || '', f.nome, f.status || (f.data_demissao ? 'INATIVO' : 'ATIVO'), f.data_admissao || '', f.data_demissao || '']),
      };
      setGenerated(previous => ({ ...previous, [empresa.id]: item }));

      const path = `${competencia}/${empresa.id}/${fileName}`;
      const upload = await supabase.storage.from('clinicas-envios').upload(path, item.blob, { upsert: true, contentType: MIME });
      if (upload.error) throw upload.error;
      toast.success(`Planilha gerada: ${item.count} funcionários, ${item.alterados} alterações do mês.`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao gerar a planilha.');
    } finally {
      setBusy('');
    }
  };

  const baixar = (item: Gerado) => {
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const prepararEmail = (empresa: Empresa, item: Gerado) => {
    setDraft({
      to: [DESTINATARIO],
      cc: [COPIA_FIXA],
      subject: `Modelo 1 para atualização - ${empresa.nome} - ${competencia}`,
      body: `Prezados,\n\nSegue a planilha Modelo 1 da ${empresa.nome}, competência ${competencia}, com as admissões e demissões atualizadas.\n\nAtenciosamente,\nRodrigo de Souza Sabino`,
      attachments: [{ attachmentBlob: item.blob, attachmentName: item.fileName, attachmentContentType: MIME, documentName: item.fileName }],
      moduleOrigin: 'envios-clinicas',
      documentName: item.fileName,
    });
    setEmailOpen(true);
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Carregando...</div>;

  return <div className="p-4 md:p-8 space-y-6">
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-7 w-7" /> Envios mensais para clínicas</h1>
      <p className="text-muted-foreground">Preenche somente matrícula, código, nome, situação, admissão e demissão. Nenhuma outra informação é inventada.</p>
    </div>
    <Card><CardContent className="pt-6 flex flex-wrap gap-3 items-end">
      <div><label className="text-sm font-medium">Competência</label><Input type="month" value={competencia} onChange={event => { setCompetencia(event.target.value); setGenerated({}); }} /></div>
      <Button variant="outline" onClick={() => void carregar()}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar dados</Button>
      <div className="text-sm"><b>Para:</b> {DESTINATARIO} &nbsp; <b>Cópia fixa:</b> {COPIA_FIXA}</div>
    </CardContent></Card>
    <div className="grid gap-4">
      {empresas.map(empresa => {
        const lista = porEmpresa.get(empresa.id) || [];
        const item = generated[empresa.id];
        return <Card key={empresa.id}>
          <CardHeader className="pb-3"><CardTitle className="flex justify-between"><span>{empresa.nome}</span><span className="text-sm font-normal">{lista.length} funcionários</span></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {item && <div className="rounded-lg border p-3 space-y-2">
              <div className="text-emerald-600 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Gerado sem campos extras: {item.count} funcionários e {item.alterados} linhas destacadas.</div>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Matrícula','Código','Nome','Situação','Admissão','Demissão'].map(h => <th key={h} className="text-left p-1 border-b">{h}</th>)}</tr></thead><tbody>{item.preview.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="p-1 border-b">{value}</td>)}</tr>)}</tbody></table></div>
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void gerar(empresa)} disabled={busy === empresa.id}>{busy === empresa.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />} Gerar e validar</Button>
              {item && <Button variant="outline" onClick={() => baixar(item)}><Download className="h-4 w-4 mr-2" /> Baixar</Button>}
              {item && <Button onClick={() => prepararEmail(empresa, item)}><Send className="h-4 w-4 mr-2" /> Conferir e enviar</Button>}
            </div>
          </CardContent>
        </Card>;
      })}
    </div>
    <EmailPdfModal open={emailOpen} draft={draft} onOpenChange={setEmailOpen} />
  </div>;
};

export default EnviosMensaisClinicasV2Page;
