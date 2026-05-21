import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle2, FileSearch, Mail, RefreshCw, Save, Upload } from 'lucide-react';
import { openEmailClient } from '@/lib/emailUtils';
import { downloadPdf, gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';

type PreCadastro = {
  id: string;
  status: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  cnpj: string | null;
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  data_admissao: string | null;
  funcao: string | null;
  setor_ghe: string | null;
  obra_local: string | null;
  salario: number | null;
  tipo_admissao: string | null;
  jornada: string | null;
  beneficios: string | null;
  insalubridade: string | null;
  filiacao: string | null;
  endereco: string | null;
  escolaridade: string | null;
  experiencia: string | null;
  epi: string | null;
  responsavel_contato: string | null;
  arquivo_ficha_url: string | null;
  arquivo_aso_url: string | null;
  created_at: string;
};

const statusLabel: Record<string, string> = {
  aguardando_validacao: 'Aguardando validacao',
  aguardando_aso: 'Aguardando ASO',
  documentacao_completa: 'Documentacao completa',
  pronto_para_registro: 'Pronto para registro',
  cadastro_oficial: 'Cadastro oficial',
};

const initialForm: Partial<PreCadastro> = {
  status: 'aguardando_validacao',
  nome: '',
  cpf: '',
  rg: '',
  funcao: '',
  setor_ghe: '',
  obra_local: '',
  tipo_admissao: 'Admissional',
  jornada: '',
  beneficios: '',
  insalubridade: '',
  filiacao: '',
  endereco: '',
  escolaridade: '',
  experiencia: '',
  epi: '',
  responsavel_contato: '',
};

const onlyDigits = (v?: string | null) => String(v || '').replace(/\D/g, '');

const uploadAdmissionFile = async (file: File, prefix: string) => {
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const path = `${prefix}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('documentos-admissionais').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('documentos-admissionais').getPublicUrl(path);
  return data.publicUrl;
};

const buildExameEmailBody = (r: Partial<PreCadastro>) => [
  'Prezados, bom dia.',
  '',
  'Solicitamos, por gentileza, o agendamento do exame admissional do colaborador abaixo:',
  '',
  `Nome: ${r.nome || ''}`,
  `CPF: ${r.cpf || ''}`,
  `Data de nascimento: ${r.data_nascimento || ''}`,
  `Empresa: ${r.empresa_nome || ''}`,
  `CNPJ: ${r.cnpj || ''}`,
  `Funcao: ${r.funcao || ''}`,
  `Setor/GHE: ${r.setor_ghe || ''}`,
  `Obra/Local: ${r.obra_local || ''}`,
  '',
  'Segue guia de autorizacao de exame em anexo.',
  '',
  'Pedimos, por gentileza, a confirmacao do recebimento deste e-mail e do agendamento.',
  '',
  'Atenciosamente,',
  'TOPAC RH PRO',
].join('\n');

const buildContabilidadeEmailBody = (r: Partial<PreCadastro>) => [
  'Prezados, bom dia.',
  '',
  'Solicitamos, por gentileza, o registro do colaborador abaixo:',
  '',
  `Nome: ${r.nome || ''}`,
  `CPF: ${r.cpf || ''}`,
  `RG: ${r.rg || ''}`,
  `Data de nascimento: ${r.data_nascimento || ''}`,
  `Empresa: ${r.empresa_nome || ''}`,
  `CNPJ: ${r.cnpj || ''}`,
  `Funcao: ${r.funcao || ''}`,
  `Setor: ${r.setor_ghe || ''}`,
  `Salario: ${r.salario ? r.salario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}`,
  `Data de inicio: ${r.data_admissao || ''}`,
  `Tipo de admissao: ${r.tipo_admissao || ''}`,
  `Horario/Jornada: ${r.jornada || ''}`,
  `Beneficios: ${r.beneficios || ''}`,
  `Insalubridade, se aplicavel: ${r.insalubridade || ''}`,
  '',
  'Segue em anexo a documentacao admissional completa, incluindo ASO.',
  '',
  'Pedimos a gentileza de confirmar o recebimento e dar andamento ao registro.',
  '',
  'Atenciosamente,',
  'TOPAC RH PRO',
].join('\n');

const PreCadastroAdmissionalPage: React.FC = () => {
  const { companies, refreshData, session } = useApp();
  const [rows, setRows] = useState<PreCadastro[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<Partial<PreCadastro>>(initialForm);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = rows.find(r => r.id === selectedId);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('pre_cadastros_admissionais')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(`Erro ao carregar pre-cadastros: ${error.message}`);
      return;
    }
    setRows(data || []);
  };

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    const onRefresh = () => carregar();
    window.addEventListener('topac:refresh-current', onRefresh);
    return () => window.removeEventListener('topac:refresh-current', onRefresh);
  }, []);

  useEffect(() => {
    if (selected) setForm(selected);
  }, [selected]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || `${r.nome} ${r.cpf} ${r.empresa_nome} ${r.status} ${r.funcao}`.toLowerCase().includes(q));
  }, [rows, search]);

  const setCompany = (id: string) => {
    const c = companies.find(x => x.id === id);
    setForm(p => ({ ...p, empresa_id: id, empresa_nome: c?.name || '', cnpj: c?.cnpj || '' }));
  };

  const novo = () => {
    setSelectedId('');
    setForm(initialForm);
  };

  const salvar = async () => {
    setSaving(true);
    const payload = { ...form, criado_por: session?.user?.id || null };
    const req = form.id
      ? (supabase as any).from('pre_cadastros_admissionais').update(payload).eq('id', form.id).select('*').single()
      : (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('*').single();
    const { data, error } = await req;
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success('Pre-cadastro salvo no banco');
    setSelectedId(data.id);
    await carregar();
  };

  const uploadFicha = async (file?: File | null) => {
    if (!file) return;
    try {
      const url = await uploadAdmissionFile(file, 'fichas');
      setForm(p => ({ ...p, arquivo_ficha_url: url, status: p.status || 'aguardando_validacao' }));
      toast.success('Ficha anexada. Confira os dados antes de aprovar.');
    } catch (e: any) {
      toast.error(`Erro no upload da ficha: ${e.message}`);
    }
  };

  const uploadDocumento = async (tipoDocumento: string, file?: File | null) => {
    if (!file || !form.id) { toast.error('Salve o pre-cadastro antes de anexar documentos'); return; }
    try {
      const url = await uploadAdmissionFile(file, `documentos/${form.id}`);
      const { error } = await (supabase as any).from('pre_cadastro_documentos').insert({
        pre_cadastro_id: form.id,
        tipo_documento: tipoDocumento,
        nome_arquivo: file.name,
        arquivo_url: url,
      });
      if (error) throw error;
      toast.success('Documento anexado');
    } catch (e: any) {
      toast.error(`Erro ao anexar documento: ${e.message}`);
    }
  };

  const enviarExame = async () => {
    if (!form.nome) { toast.error('Informe o nome do funcionario'); return; }
    const pdf = gerarAutorizacaoExameAdmissionalPdf({
      empresa: form.empresa_nome || '',
      cnpj: form.cnpj || '',
      nome: form.nome || '',
      cpf: form.cpf || '',
      rg: form.rg || '',
      funcao: form.funcao || '',
      dataAdmissao: form.data_admissao || '',
      dataNascimento: form.data_nascimento || '',
      setorGhe: form.setor_ghe || '',
      dataExame: new Date().toISOString().slice(0, 10),
      tipoExame: 'Admissional',
      obraLocal: form.obra_local || '',
      trabalhoAltura: false,
      espacoConfinado: false,
      toxicologico: false,
      responsavelContato: form.responsavel_contato || '',
    });
    downloadPdf(pdf.blob, pdf.fileName);
    openEmailClient({
      to: ['agendamento@ponteaereaseguranca.com.br'],
      cc: ['robson@topac.com.br'],
      subject: `Solicitacao de Agendamento de Exame Admissional - ${form.nome}`,
      body: buildExameEmailBody(form),
    });
    if (form.id) {
      await (supabase as any).rpc('admin_pre_cadastro_marcar_exame_enviado', { p_id: form.id });
      await carregar();
    }
    toast.success('E-mail aberto e guia baixada. Anexe o PDF baixado antes de enviar.');
  };

  const uploadASO = async (file?: File | null) => {
    if (!file || !form.id) { toast.error('Salve o pre-cadastro antes de anexar ASO'); return; }
    try {
      const url = await uploadAdmissionFile(file, `aso/${form.id}`);
      await (supabase as any).from('pre_cadastro_documentos').insert({
        pre_cadastro_id: form.id,
        tipo_documento: 'aso',
        nome_arquivo: file.name,
        arquivo_url: url,
      });
      const { error } = await (supabase as any).rpc('admin_pre_cadastro_marcar_aso_recebido', { p_id: form.id, p_arquivo_url: url });
      if (error) throw error;
      toast.success('ASO recebido. Documentacao completa para registro.');
      await carregar();
    } catch (e: any) {
      toast.error(`Erro ao salvar ASO: ${e.message}`);
    }
  };

  const enviarContabilidade = async () => {
    openEmailClient({
      to: ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br'],
      cc: ['robson@topac.com.br'],
      subject: `Solicitacao de Registro - ${form.nome || ''} - ${form.empresa_nome || ''}`,
      body: buildContabilidadeEmailBody(form),
    });
    if (form.id) {
      await (supabase as any).rpc('admin_pre_cadastro_preparar_contabilidade', { p_id: form.id });
      await carregar();
    }
    toast.success('E-mail para contabilidade aberto. Anexe a documentacao completa.');
  };

  const aprovarOficial = async () => {
    if (!form.id) return;
    if (!form.empresa_id || !form.nome) { toast.error('Empresa e nome sao obrigatorios'); return; }
    const { error } = await (supabase as any).rpc('admin_pre_cadastro_aprovar_oficial', { p_id: form.id });
    if (error) { toast.error(`Erro ao aprovar: ${error.message}`); return; }
    toast.success('Cadastro oficial criado/atualizado em Funcionarios');
    await Promise.all([carregar(), refreshData()]);
  };

  const duplicateCpf = useMemo(() => {
    const cpf = onlyDigits(form.cpf);
    if (!cpf) return false;
    return rows.some(r => r.id !== form.id && onlyDigits(r.cpf) === cpf);
  }, [rows, form.cpf, form.id]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <FileSearch className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Pre-cadastro Admissional</h1>
            <p className="text-primary-foreground/70 text-sm">Ficha, exame, documentos, ASO e aprovacao antes da base oficial.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
        <div className="card-premium p-4 space-y-3">
          <div className="flex gap-2">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome, CPF, empresa, status..." />
            <Button variant="outline" onClick={carregar} disabled={loading}><RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /></Button>
          </div>
          <Button onClick={novo} className="w-full gradient-accent text-accent-foreground">Novo pre-cadastro</Button>
          <div className="space-y-2 max-h-[62vh] overflow-y-auto">
            {filtered.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left rounded-xl border p-3 hover:bg-muted/40 ${selectedId === r.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="font-semibold text-sm">{r.nome || 'Sem nome informado'}</div>
                <div className="text-xs text-muted-foreground">{r.empresa_nome || 'Empresa pendente'} - {r.cpf || 'CPF pendente'}</div>
                <Badge variant="outline" className="mt-2 text-[10px]">{statusLabel[r.status] || r.status}</Badge>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Nenhum pre-cadastro encontrado.</div>}
          </div>
        </div>

        <div className="card-premium p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Conferencia admissional</h2>
              <p className="text-xs text-muted-foreground">Nada entra em Funcionarios antes da aprovacao final.</p>
            </div>
            <Badge className="bg-warning/20 text-warning">{statusLabel[String(form.status)] || form.status || 'Aguardando validacao'}</Badge>
          </div>

          <div className="rounded-xl border border-dashed border-primary/40 p-4">
            <label className="text-sm font-semibold flex items-center gap-2 mb-2"><Upload className="w-4 h-4" /> Ficha de Solicitacao de Emprego</label>
            <input type="file" accept=".pdf,image/*" onChange={e => uploadFicha(e.target.files?.[0])} className="text-sm" />
            {form.arquivo_ficha_url && <a href={form.arquivo_ficha_url} target="_blank" className="block mt-2 text-xs text-primary underline">Abrir ficha anexada</a>}
          </div>

          {duplicateCpf && <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-warning">CPF ja existe em outro pre-cadastro. Confira antes de aprovar.</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Empresa contratante</label><select value={form.empresa_id || ''} onChange={e => setCompany(e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="">Selecionar empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground">Nome</label><Input value={form.nome || ''} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">CPF</label><Input value={form.cpf || ''} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">RG</label><Input value={form.rg || ''} onChange={e => setForm(p => ({ ...p, rg: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Data nascimento</label><Input type="date" value={form.data_nascimento || ''} onChange={e => setForm(p => ({ ...p, data_nascimento: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Data admissao/inicio</label><Input type="date" value={form.data_admissao || ''} onChange={e => setForm(p => ({ ...p, data_admissao: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Funcao</label><Input value={form.funcao || ''} onChange={e => setForm(p => ({ ...p, funcao: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Setor/GHE</label><Input value={form.setor_ghe || ''} onChange={e => setForm(p => ({ ...p, setor_ghe: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Obra/Local</label><Input value={form.obra_local || ''} onChange={e => setForm(p => ({ ...p, obra_local: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Salario</label><Input type="number" value={form.salario || ''} onChange={e => setForm(p => ({ ...p, salario: Number(e.target.value) || null }))} /></div>
            <div><label className="text-xs text-muted-foreground">Tipo admissao</label><Input value={form.tipo_admissao || ''} onChange={e => setForm(p => ({ ...p, tipo_admissao: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Jornada</label><Input value={form.jornada || ''} onChange={e => setForm(p => ({ ...p, jornada: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Filiacao</label><Input value={form.filiacao || ''} onChange={e => setForm(p => ({ ...p, filiacao: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Escolaridade</label><Input value={form.escolaridade || ''} onChange={e => setForm(p => ({ ...p, escolaridade: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Responsavel/Contato</label><Input value={form.responsavel_contato || ''} onChange={e => setForm(p => ({ ...p, responsavel_contato: e.target.value }))} /></div>
            <div className="md:col-span-3"><label className="text-xs text-muted-foreground">Endereco</label><Input value={form.endereco || ''} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <div className="md:col-span-3"><label className="text-xs text-muted-foreground">Experiencia / EPI / Beneficios / Insalubridade</label><Input value={`${form.experiencia || ''}`} onChange={e => setForm(p => ({ ...p, experiencia: e.target.value }))} placeholder="Experiencia" /></div>
            <div><Input value={form.epi || ''} onChange={e => setForm(p => ({ ...p, epi: e.target.value }))} placeholder="EPI" /></div>
            <div><Input value={form.beneficios || ''} onChange={e => setForm(p => ({ ...p, beneficios: e.target.value }))} placeholder="Beneficios" /></div>
            <div><Input value={form.insalubridade || ''} onChange={e => setForm(p => ({ ...p, insalubridade: e.target.value }))} placeholder="Insalubridade" /></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar conferencia'}</Button>
            <Button onClick={enviarExame} variant="outline"><Mail className="w-4 h-4 mr-2" /> Enviar solicitacao de exame</Button>
            <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer hover:bg-muted">
              Anexar documentos
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadDocumento('documentacao_admissional', e.target.files?.[0])} />
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer hover:bg-muted">
              Subir ASO
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} />
            </label>
            <Button onClick={enviarContabilidade} variant="outline"><ArrowRight className="w-4 h-4 mr-2" /> E-mail contabilidade</Button>
            <Button onClick={aprovarOficial} className="gradient-accent text-accent-foreground"><CheckCircle2 className="w-4 h-4 mr-2" /> Aprovar cadastro oficial</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreCadastroAdmissionalPage;
