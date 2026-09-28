import React, { useMemo, useState } from 'react';
import { FileText, Loader2, Save, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText, extractPdfTextByLines, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { toast } from 'sonner';

type TipoAtivo = 'veiculo' | 'compressor' | 'equipamento';
type FormState = {
  tipo: TipoAtivo;
  descricao: string;
  placa: string;
  patrimonio: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  empresa: string;
  marca: string;
  modelo: string;
  observacao: string;
};

const EMPTY: FormState = {
  tipo: 'veiculo',
  descricao: '',
  placa: '',
  patrimonio: '',
  renavam: '',
  chassi: '',
  ano_fabricacao: '',
  ano_modelo: '',
  empresa: 'TOPAC MATRIZ',
  marca: '',
  modelo: '',
  observacao: '',
};

const plain = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const plate = (v: unknown) => plain(v).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';
const renavam = (v: unknown) => String(v || '').replace(/\D/g, '').match(/\d{9,11}/)?.[0] || '';
const chassis = (v: unknown) => {
  const raw = plain(v).replace(/[^A-Z0-9]/g, '');
  const hit = raw.match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || '';
  if (!hit) return '';
  if (!/[0-9]/.test(hit) || !/[A-Z]/.test(hit)) return '';
  if (/(VERSAO|MODELO|VEICULO|RENAVAM|PLACA)/.test(hit)) return '';
  return hit;
};
const year = (v: unknown) => String(v || '').match(/(?:19|20)\d{2}/)?.[0] || '';
const patrimonio = (v: unknown) => plain(v).match(/\b[A-Z]\d{1,3}\.\d{1,5}\b/)?.[0] || '';
const first = (...v: unknown[]) => v.map(x => String(x || '').trim()).find(Boolean) || '';
const cleanModel = (v: unknown) => {
  const value = plain(v)
    .replace(/^(MARCA\s*\/\s*MODELO|MARCA\s+MODELO|MODELO\s*\/\s*VERSAO|MODELO|VERSAO)\s*[:\-]?\s*/i, '')
    .replace(/^[\s/\-:|.]+|[\s/\-:|.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';
  if (/^(VERSAO|MODELO|MARCA|VEICULO|CARRO|\/|-)$/i.test(value)) return '';
  if (value.length < 3) return '';
  return value;
};
const cleanDescription = (v: unknown) => {
  const value = String(v || '').trim().replace(/\s+/g, ' ');
  const normalized = plain(value);
  if (!normalized || /^(\/\s*)?VERSAO$|^MODELO$|^MARCA$|^VEICULO$/i.test(normalized)) return '';
  return value;
};

const inferTipo = (text: string): TipoAtivo => {
  const n = plain(text);
  if (/\b(COMPRESSOR|MOTOCOMPRESSOR)\b/.test(n)) return 'compressor';
  if (/\b(GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE DE ILUMINACAO)\b/.test(n)) return 'equipamento';
  return 'veiculo';
};

const parseLocal = (text: string) => {
  const n = plain(text);
  const tipo = inferTipo(n);
  const years = n.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const model = cleanModel(first(
    n.match(/\bMARCA\s*\/?\s*MODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|PATRIMONIO|CAPACIDADE|POTENCIA)\b|$)/i)?.[1],
    n.match(/\bMODELO\s*\/?\s*VERSAO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|PATRIMONIO|CAPACIDADE|POTENCIA)\b|$)/i)?.[1],
    n.match(/\bMODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{2,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|PATRIMONIO|VERSAO|CAPACIDADE|POTENCIA)\b|$)/i)?.[1],
  ));
  return {
    tipo,
    descricao: model ? `${tipo === 'compressor' ? 'COMPRESSOR' : tipo === 'equipamento' ? 'EQUIPAMENTO' : 'CARRO'} - ${model}`
      : tipo === 'compressor' ? 'COMPRESSOR' : tipo === 'equipamento' ? 'EQUIPAMENTO' : '',
    placa: plate(n.match(/\bPLACA\b[^A-Z0-9]{0,20}([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/i)?.[1] || n),
    patrimonio: patrimonio(n),
    renavam: renavam(n.match(/\bRENAVAM\b[^0-9]{0,30}(\d[\d.\s-]{7,16})/i)?.[1] || ''),
    chassi: chassis(n.match(/\b(?:CHASSI|VIN)\b[^A-Z0-9]{0,12}([A-HJ-NPR-Z0-9]{17})\b/i)?.[1] || ''),
    ano_fabricacao: years?.[1] || '',
    ano_modelo: years?.[2] || years?.[1] || '',
    modelo: model,
  };
};

export default function FrotaCadastroInteligente({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const { session, companies } = useApp();
  const empresaPadrao = useMemo(
    () => companies.find(c => /matriz/i.test(c.name))?.name || 'TOPAC MATRIZ',
    [companies],
  );
  const [form, setForm] = useState<FormState>({ ...EMPTY, empresa: empresaPadrao });
  const [smartText, setSmartText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const parseDocument = async (text: string, file?: File | null) => {
    if (!text.trim() && !file) return toast.error('Cole os dados ou selecione o PDF do documento.');
    setParsing(true);
    try {
      let extractedText = text.trim();
      let images: string[] = [];
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdfText = await extractPdfTextByLines(bytes).catch(() => extractPdfText(bytes)).catch(() => '');
        extractedText = [extractedText, pdfText].filter(Boolean).join('\n');
        // Sempre envia as primeiras páginas como imagem também. Em CRLV/documentos digitalizados,
        // a camada de texto pode existir, mas vir fora de ordem e montar campos incorretos.
        images = (await renderPdfPagesToDataUrls(bytes, 1.3, 3)).pageUrls;
      }

      const local = parseLocal(`${file?.name || ''}\n${extractedText}`);
      let ai: Record<string, unknown> = {};
      try {
        const { data, error } = await supabase.functions.invoke('parse-text', {
          body: {
            type: 'documento_veiculo',
            text: `Arquivo: ${file?.name || 'texto colado'}\n\n${extractedText}`.slice(0, 80000),
            images,
          },
        });
        if (!error) ai = (data?.data || {}) as Record<string, unknown>;
      } catch {}

      const context = `${extractedText} ${ai.descricao || ''} ${ai.tipo_veiculo || ''} ${ai.modelo || ''}`;
      const tipo = inferTipo(context || String(local.tipo));
      const modelo = cleanModel(first(ai.modelo, ai.marca_modelo, local.modelo));
      const empresaLida = first(ai.empresa, empresaPadrao);
      setForm({
        ...EMPTY,
        tipo,
        descricao: first(
          cleanDescription(ai.descricao),
          cleanDescription(local.descricao),
          modelo ? `${tipo === 'compressor' ? 'COMPRESSOR' : tipo === 'equipamento' ? 'EQUIPAMENTO' : 'CARRO'} - ${modelo}` : '',
          tipo === 'compressor' ? 'COMPRESSOR' : tipo === 'equipamento' ? 'EQUIPAMENTO' : 'CARRO',
        ),
        placa: plate(first(ai.placa, local.placa)),
        patrimonio: first(ai.patrimonio, local.patrimonio),
        renavam: renavam(first(ai.renavam, local.renavam)),
        chassi: chassis(first(ai.chassi, local.chassi)),
        ano_fabricacao: year(first(local.ano_fabricacao, ai.ano_fabricacao, ai.ano)),
        ano_modelo: year(first(local.ano_modelo, ai.ano_modelo, ai.ano)),
        empresa: empresaLida,
        marca: first(ai.marca),
        modelo,
        observacao: first(ai.observacao),
      });
      setReady(true);
      toast.success(file ? 'PDF lido. Confira os dados identificados antes de salvar.' : 'Dados interpretados. Confira antes de salvar.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível interpretar o documento.');
    } finally {
      setParsing(false);
    }
  };

  const directSave = async () => {
    if (!session?.user?.id) throw new Error('Sessão expirada.');
    const payload: any = {
      user_id: session.user.id,
      tipo: form.tipo,
      descricao: form.descricao || (form.tipo === 'compressor' ? 'COMPRESSOR' : 'CARRO'),
      placa: form.placa,
      patrimonio: form.patrimonio,
      renavam: form.renavam,
      chassi: form.chassi,
      ano_fabricacao: form.ano_fabricacao,
      ano_modelo: form.ano_modelo,
      empresa: form.empresa || empresaPadrao,
      marca: form.marca,
      modelo: form.modelo,
      tipo_veiculo: form.tipo === 'compressor' ? 'compressor_locacao' : form.tipo === 'equipamento' ? 'equipamento' : 'carro',
      observacao: form.observacao,
      status: 'ativo',
      updated_at: new Date().toISOString(),
    };

    if (pdfFile) {
      const ext = pdfFile.name.split('.').pop() || 'pdf';
      const path = `${session.user.id}/frota/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('documentos-ativos').upload(path, pdfFile, {
        contentType: pdfFile.type || 'application/pdf',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('documentos-ativos').getPublicUrl(path);
      payload.arquivo_url = data.publicUrl;
      payload.documento_url = data.publicUrl;
      payload.documento_nome = pdfFile.name;
      payload.documento_atualizado_em = new Date().toISOString();
    }

    let id = '';
    if (form.placa) {
      const { data } = await supabase.from('ativos').select('id').eq('placa', form.placa).limit(1).maybeSingle();
      id = data?.id || '';
    }
    if (!id && form.patrimonio) {
      const { data } = await supabase.from('ativos').select('id').eq('patrimonio', form.patrimonio).limit(1).maybeSingle();
      id = data?.id || '';
    }
    const result = id
      ? await supabase.from('ativos').update(payload).eq('id', id)
      : await supabase.from('ativos').insert(payload);
    if (result.error) throw result.error;
    return id ? 'atualizado' : 'cadastrado';
  };

  const save = async () => {
    if (!session?.user?.id || !session?.access_token) return toast.error('Sessão expirada.');
    if (!ready) return toast.error('Interprete o documento primeiro.');
    setSaving(true);
    try {
      let action = '';
      if (pdfFile && pdfFile.size <= 4_000_000) {
        const fd = new FormData();
        fd.append('file', pdfFile, pdfFile.name);
        fd.append('extracted', JSON.stringify({
          ...form,
          tipo_veiculo: form.tipo === 'compressor' ? 'compressor_locacao' : form.tipo === 'equipamento' ? 'equipamento' : 'carro',
        }));
        const response = await fetch('/api/frota-upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `Falha HTTP ${response.status}`);
        action = payload.action || 'salvo';
      } else {
        action = await directSave();
      }
      toast.success(`Ativo ${action}. ${form.tipo === 'compressor' ? 'Classificado em Compressores de Locação.' : form.tipo === 'veiculo' ? 'Classificado na Frota de Veículos.' : 'Classificado como equipamento.'}`);
      setForm({ ...EMPTY, empresa: empresaPadrao });
      setSmartText('');
      setPdfFile(null);
      setReady(false);
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-premium p-5 space-y-5 border-l-4 border-primary">
      <div>
        <h2 className="text-lg font-bold">Janela Inteligente da Frota</h2>
        <p className="text-xs text-muted-foreground">Cole os dados ou envie o PDF do documento. A janela identifica o ativo, separa Frota de Veículos de Compressores de Locação e preenche os dados do documento.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          value={smartText}
          onChange={e => { setSmartText(e.target.value); setReady(false); }}
          rows={6}
          placeholder="Cole aqui o texto do documento (opcional quando enviar PDF)..."
          className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 px-5 text-center hover:bg-primary/10 md:min-w-56">
          <Upload className="mb-2 h-6 w-6 text-primary" />
          <span className="text-sm font-semibold">{pdfFile ? pdfFile.name : 'Enviar PDF do documento'}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">A leitura preenche placa, RENAVAM, chassi, ano, empresa e tipo.</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { setPdfFile(e.target.files?.[0] || null); setReady(false); }}
          />
        </label>
      </div>

      <Button onClick={() => void parseDocument(smartText, pdfFile)} disabled={parsing || (!smartText.trim() && !pdfFile)} variant="outline" className="w-full">
        {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {parsing ? 'Lendo documento...' : 'Interpretar documento'}
      </Button>

      {ready && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <b>Grupo</b>
              <select value={form.tipo} onChange={e => setForm(current => ({ ...current, tipo: e.target.value as TipoAtivo }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2">
                <option value="veiculo">Frota de Veículos</option>
                <option value="compressor">Compressores de Locação</option>
                <option value="equipamento">Outro equipamento</option>
              </select>
            </div>
            <div><b>Placa</b><input value={form.placa} onChange={e => setForm(v => ({ ...v, placa: plate(e.target.value) }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div><b>RENAVAM</b><input value={form.renavam} onChange={e => setForm(v => ({ ...v, renavam: renavam(e.target.value) }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div><b>Patrimônio</b><input value={form.patrimonio} onChange={e => setForm(v => ({ ...v, patrimonio: e.target.value }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div className="col-span-2"><b>Descrição / veículo</b><input value={form.descricao} onChange={e => setForm(v => ({ ...v, descricao: e.target.value }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div className="col-span-2"><b>Chassi</b><input value={form.chassi} onChange={e => setForm(v => ({ ...v, chassi: e.target.value }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div><b>Ano fabricação</b><input value={form.ano_fabricacao} onChange={e => setForm(v => ({ ...v, ano_fabricacao: year(e.target.value) }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div><b>Ano modelo</b><input value={form.ano_modelo} onChange={e => setForm(v => ({ ...v, ano_modelo: year(e.target.value) }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2" /></div>
            <div className="col-span-2">
              <b>Empresa / unidade</b>
              <select value={form.empresa} onChange={e => setForm(v => ({ ...v, empresa: e.target.value }))} className="mt-1 w-full rounded-md border bg-background px-2 py-2">
                <option value={form.empresa}>{form.empresa || empresaPadrao}</option>
                {companies.filter(c => c.name !== form.empresa).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {pdfFile && <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4" /> O PDF será arquivado junto ao ativo.</div>}
          <Button onClick={() => void save()} disabled={saving} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Salvando...' : 'Confirmar e salvar'}
          </Button>
        </div>
      )}
    </section>
  );
}
