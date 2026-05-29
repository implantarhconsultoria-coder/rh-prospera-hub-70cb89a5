import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { extractPdfText, extractPdfTextByLines, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { Car, Upload, Trash2, Search, Eye, Sparkles, Loader2, Printer, Edit2, Save, X, AlertTriangle, Wrench, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { printDocumentInPage } from '@/lib/printInPage';

interface Ativo {
  id: string;
  tipo: string;
  descricao: string;
  placa: string;
  patrimonio: string;
  empresa: string;
  arquivo_url: string;
  observacao: string;
  status: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  vencimento_ipva: string | null;
  vencimento_licenciamento: string | null;
}

interface Manutencao {
  id: string;
  ativo_id: string | null;
  veiculo_descricao: string | null;
  placa: string | null;
  data: string;
  km: number | null;
  descricao: string;
  fornecedor: string | null;
  nota_numero: string | null;
  valor: number;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  origem: string | null;
  observacao: string | null;
}

type FilterType = 'todos' | 'ipva_vencer' | 'ipva_vencido' | 'lic_vencer' | 'lic_vencido';

const getAlertStatus = (dateStr: string | null): 'em_dia' | 'a_vencer' | 'vencido' | 'sem_data' => {
  if (!dateStr) return 'sem_data';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'vencido';
  if (diff <= 30) return 'a_vencer';
  return 'em_dia';
};

const statusBadge = (s: string) => {
  if (s === 'em_dia') return <Badge className="text-[10px] bg-success text-success-foreground">Em dia</Badge>;
  if (s === 'a_vencer') return <Badge className="text-[10px] bg-warning text-warning-foreground">A vencer</Badge>;
  if (s === 'vencido') return <Badge className="text-[10px] bg-destructive text-destructive-foreground">Vencido</Badge>;
  return <Badge variant="outline" className="text-[10px]">-</Badge>;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });

const VEICULOS_LOCAL_KEY = 'topac:frota:documentos-veiculos';
const MANUTENCOES_LOCAL_KEY = 'topac:frota:manutencoes';

const isMissingSchema = (error: any) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === 'PGRST205' || msg.includes('schema cache') || msg.includes('could not find the table');
};

const newLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const readLocalList = <T,>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
};

const writeLocalList = <T,>(key: string, list: T[]) => {
  localStorage.setItem(key, JSON.stringify(list));
};

const normalizePlainText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const formatPlaca = (value: string) => {
  const clean = normalizePlainText(value).replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/);
  return match?.[0] || '';
};

const formatRenavam = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  const match = digits.match(/\d{9,11}/);
  return match?.[0] || '';
};

const formatChassi = (value: string) => {
  const clean = normalizePlainText(value).replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/[A-HJ-NPR-Z0-9]{17}/);
  return match?.[0] || '';
};

const isPlateLike = (value: string) => !!formatPlaca(value) && normalizePlainText(value).replace(/[^A-Z0-9]/g, '').length <= 8;

const findInLabelWindow = (lines: string[], label: RegExp, value: RegExp, fallbackText = '') => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizePlainText(lines[index]);
    if (!label.test(line)) continue;
    const windowText = normalizePlainText(lines.slice(index, index + 4).join(' '));
    const match = windowText.match(value);
    if (match?.[1] || match?.[0]) return match[1] || match[0];
  }
  const fallback = normalizePlainText(fallbackText).match(value);
  return fallback?.[1] || fallback?.[0] || '';
};

const cleanModelText = (value: string) => {
  const text = normalizePlainText(value)
    .replace(/\b(MARCA|MODELO|VERSAO|VEICULO|CODIGO|RENAVAM|CHASSI|PLACA|ANO|FABRICACAO|FAB|MOD)\b/g, ' ')
    .replace(/[|:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || isPlateLike(text) || /^\d+$/.test(text)) return '';
  return text.length > 80 ? text.slice(0, 80).trim() : text;
};

const findModelText = (lines: string[]) => {
  const labels = /(MARCA\s*\/?\s*MODELO|MARCA\s+MODELO|MODELO\s*\/?\s*VERSAO|MARCA)/;
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizePlainText(lines[index]);
    if (!labels.test(normalized)) continue;
    const sameLine = cleanModelText(lines[index]);
    if (sameLine && !labels.test(sameLine)) return sameLine;
    for (let next = index + 1; next <= index + 3 && next < lines.length; next += 1) {
      const candidate = cleanModelText(lines[next]);
      if (candidate && !/(RENAVAM|CHASSI|PLACA|CPF|CNPJ|NOME|EXERCICIO)/.test(candidate)) return candidate;
    }
  }
  return '';
};

const inferDescricaoTipo = (text: string, model = '') => {
  const normalized = normalizePlainText(`${model} ${text}`);
  const isCarroceria =
    /(SEMI\s*REBOQUE|SEMI-REBOQUE|REBOQUE|CARRETA|DOLLY|SR\/|R\/|REB\/|CARROCERIA\s+(BAU|ABERTA|FECHADA|METALICA)|RANDON|FACCHINI|GUERRA|LIBRELATO)/.test(normalized);
  const tipo = isCarroceria ? 'CARROCERIA' : 'CARRO';
  const modelo = cleanModelText(model);
  return modelo ? `${tipo} - ${modelo}` : tipo;
};

const normalizeVehicleExtraction = (aiData: any, localData: any, fileName: string) => {
  const rawDescricao = String(aiData?.descricao || localData?.descricao || '');
  const marcaModelo = cleanModelText(aiData?.marca_modelo || aiData?.modelo || localData?.marca_modelo || rawDescricao);
  const context = `${rawDescricao} ${marcaModelo} ${localData?.sourceText || ''}`;
  const descricao = inferDescricaoTipo(context, isPlateLike(rawDescricao) ? marcaModelo : rawDescricao || marcaModelo);

  return {
    placa: formatPlaca(localData?.placa || aiData?.placa || fileName),
    renavam: formatRenavam(localData?.renavam || aiData?.renavam || ''),
    chassi: formatChassi(localData?.chassi || aiData?.chassi || ''),
    ano_fabricacao: String(localData?.ano_fabricacao || aiData?.ano_fabricacao || '').replace(/\D/g, '').slice(0, 4),
    ano_modelo: String(localData?.ano_modelo || aiData?.ano_modelo || '').replace(/\D/g, '').slice(0, 4),
    patrimonio: String(aiData?.patrimonio || localData?.patrimonio || '').trim(),
    descricao,
    empresa: String(aiData?.empresa || localData?.empresa || 'TOPAC MATRIZ').trim(),
    observacao: String(aiData?.observacao || localData?.observacao || '').trim(),
  };
};

const parseVehicleTextLocally = (text: string, fileName: string) => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const all = `${fileName}\n${text}`;
  const normalizedAll = normalizePlainText(all);
  const anoPair = normalizedAll.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);

  return {
    placa: formatPlaca(findInLabelWindow(lines, /\bPLACA\b/, /([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/, all) || fileName),
    renavam: formatRenavam(findInLabelWindow(lines, /\bRENAVAM\b/, /(\d{9,11})/)),
    chassi: formatChassi(findInLabelWindow(lines, /\b(CHASSI|VIN)\b/, /([A-HJ-NPR-Z0-9]{17})/, all)),
    ano_fabricacao: findInLabelWindow(lines, /\b(FABRICACAO|ANO FAB|FAB\/MOD)\b/, /((?:19|20)\d{2})/, all) || anoPair?.[1] || '',
    ano_modelo: findInLabelWindow(lines, /\b(MODELO|ANO MOD|FAB\/MOD)\b/, /(?:19|20)\d{2}\s*\/\s*((?:19|20)\d{2})/, all) || anoPair?.[2] || '',
    marca_modelo: findModelText(lines),
    descricao: inferDescricaoTipo(all, findModelText(lines)),
    sourceText: normalizedAll,
  };
};

const normalizeAtivoForDisplay = (ativo: Ativo): Ativo => {
  const placaFromDescricao = !ativo.placa ? formatPlaca(ativo.descricao) : '';
  const descricaoLooksLikePlate = isPlateLike(ativo.descricao);
  return {
    ...ativo,
    placa: ativo.placa || placaFromDescricao,
    descricao: descricaoLooksLikePlate || !ativo.descricao?.trim()
      ? inferDescricaoTipo(`${ativo.observacao || ''} ${ativo.arquivo_url || ''}`)
      : ativo.descricao,
    renavam: formatRenavam(ativo.renavam || ''),
    chassi: formatChassi(ativo.chassi || ''),
  };
};

const DocumentosVeiculosPage: React.FC = () => {
  const { session } = useApp();
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [search, setSearch] = useState('');
  const [viewingPdf, setViewingPdf] = useState<{ url: string; descricao: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ativo>>({});
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [manutencaoErro, setManutencaoErro] = useState('');
  const [ativosErro, setAtivosErro] = useState('');
  const [manutFile, setManutFile] = useState<File | null>(null);
  const [manutForm, setManutForm] = useState({
    ativo_id: '',
    data: new Date().toISOString().slice(0, 10),
    km: '',
    descricao: '',
    fornecedor: '',
    nota_numero: '',
    valor: '',
    observacao: '',
  });

  const fetchAtivos = async () => {
    const { data, error } = await supabase.from('ativos').select('*').eq('tipo', 'veiculo').order('created_at', { ascending: false });
    if (error) {
      if (isMissingSchema(error)) {
        setAtivosErro('Tabela de veiculos ainda nao existe no Supabase. Os PDFs serao guardados localmente ate a base ser aplicada.');
        setAtivos(readLocalList<Ativo>(VEICULOS_LOCAL_KEY).map(normalizeAtivoForDisplay));
      } else {
        setAtivosErro(error.message || 'Erro ao carregar documentos de veiculos.');
      }
      return;
    }
    setAtivosErro('');
    setAtivos(((data as unknown as Ativo[]) || []).map(normalizeAtivoForDisplay));
  };

  const fetchManutencoes = async () => {
    const { data, error } = await supabase
      .from('veiculo_manutencoes' as any)
      .select('*')
      .order('data', { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingSchema(error)) {
        setManutencaoErro('Tabela de manutencao ainda nao aplicada no Supabase. Enquanto isso, o historico sera guardado localmente.');
        setManutencoes(readLocalList<Manutencao>(MANUTENCOES_LOCAL_KEY));
      } else {
        setManutencaoErro(error.message || 'Erro ao carregar manutencoes.');
      }
      return;
    }
    setManutencaoErro('');
    setManutencoes((((data as any) || []) as Manutencao[]));
  };

  useEffect(() => { fetchAtivos(); fetchManutencoes(); }, []);

  const moeda = (v: number | string | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const parseNumero = (value: string) => {
    const clean = String(value || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  };

  const analyzeVehiclePdf = async (source: File | Uint8Array, fileName: string) => {
    const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
    const extractedText = await extractPdfTextByLines(bytes)
      .catch(() => extractPdfText(bytes))
      .catch(() => '');
    const localData = parseVehicleTextLocally(extractedText, fileName);
    const { pageUrls } = await renderPdfPagesToDataUrls(bytes, 1.15, 2);
    let aiData: any = {};

    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: {
          text: `Arquivo: ${fileName}\n\n${extractedText}`.trim(),
          images: pageUrls,
          type: 'documento_veiculo',
        },
      });

      if (!error) aiData = data?.data ?? {};
    } catch (error) {
      console.warn('parse-text indisponivel para documento de veiculo; usando leitura local.', error);
    }

    return normalizeVehicleExtraction(aiData, localData, fileName);
  };

  const uploadDocumentoVeiculo = async (file: File, basePath: string) => {
    const { error: uploadError } = await supabase.storage
      .from('documentos-ativos')
      .upload(basePath, file, { contentType: file.type || 'application/pdf', upsert: false });

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(basePath);
      return { url: urlData.publicUrl, fallback: false };
    }

    console.warn('Falha no storage documentos-ativos, salvando PDF embutido no registro:', uploadError);
    return { url: await fileToDataUrl(file), fallback: true };
  };

  const handleMultiUpload = async (files: FileList) => {
    if (!session?.user?.id) { toast.error('Faca login primeiro'); return; }
    setUploading(true);
    let success = 0;
    let fallbackCount = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      let arquivo_url = '';
      try {
        const upload = await uploadDocumentoVeiculo(file, path);
        arquivo_url = upload.url;
        if (upload.fallback) fallbackCount++;
      } catch (uploadError: any) {
        toast.error(`Erro no upload de ${file.name}: ${uploadError?.message || uploadError}`);
        continue;
      }

      let extracted: any = {};
      try {
        extracted = await analyzeVehiclePdf(file, file.name);
      } catch {}

      const { error } = await supabase.from('ativos').insert({
        user_id: session.user.id,
        tipo: 'veiculo',
        descricao: extracted.descricao || file.name.replace(/\.[^/.]+$/, ''),
        placa: extracted.placa || '',
        patrimonio: extracted.patrimonio || '',
        empresa: extracted.empresa || 'TOPAC MATRIZ',
        observacao: extracted.observacao || '',
        arquivo_url,
        renavam: extracted.renavam || '',
        chassi: extracted.chassi || '',
        ano_fabricacao: extracted.ano_fabricacao || '',
        ano_modelo: extracted.ano_modelo || '',
        status: 'ativo',
      } as any);
      if (!error) success++;
      else if (isMissingSchema(error)) {
        const localAtivo: Ativo = {
          id: newLocalId(),
          tipo: 'veiculo',
          descricao: extracted.descricao || file.name.replace(/\.[^/.]+$/, ''),
          placa: extracted.placa || '',
          patrimonio: extracted.patrimonio || '',
          empresa: extracted.empresa || 'TOPAC MATRIZ',
          arquivo_url,
          observacao: extracted.observacao || 'Salvo localmente. Aplicar base Frota no Supabase para persistir oficialmente.',
          status: 'ativo',
          renavam: extracted.renavam || '',
          chassi: extracted.chassi || '',
          ano_fabricacao: extracted.ano_fabricacao || '',
          ano_modelo: extracted.ano_modelo || '',
          vencimento_ipva: null,
          vencimento_licenciamento: null,
        };
        const local = [localAtivo, ...readLocalList<Ativo>(VEICULOS_LOCAL_KEY)];
        writeLocalList(VEICULOS_LOCAL_KEY, local);
        success++;
        setAtivosErro('Tabela de veiculos ainda nao existe no Supabase. Documento salvo localmente por enquanto.');
      } else toast.error(`Erro ao cadastrar ${file.name}: ${error.message}`);
    }
    if (success > 0) {
      toast.success(`${success} documento(s) cadastrado(s)!`);
      if (fallbackCount > 0) {
        toast.warning(`${fallbackCount} PDF(s) foram salvos direto no historico porque o storage nao aceitou o upload.`);
      }
      fetchAtivos();
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('local-') || readLocalList<Ativo>(VEICULOS_LOCAL_KEY).some(a => a.id === id)) {
      writeLocalList(VEICULOS_LOCAL_KEY, readLocalList<Ativo>(VEICULOS_LOCAL_KEY).filter(a => a.id !== id));
      toast.success('Removido do historico local');
      fetchAtivos();
      return;
    }
    const { error } = await supabase.from('ativos').delete().eq('id', id);
    if (!error) { toast.success('Removido'); fetchAtivos(); }
  };

  const handleEdit = (a: Ativo) => {
    setEditingId(a.id);
    setEditForm({
      descricao: a.descricao, placa: a.placa, patrimonio: a.patrimonio,
      renavam: a.renavam, chassi: a.chassi, empresa: a.empresa,
      ano_fabricacao: a.ano_fabricacao, ano_modelo: a.ano_modelo,
      vencimento_ipva: a.vencimento_ipva || '', vencimento_licenciamento: a.vencimento_licenciamento || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (editingId.startsWith('local-') || readLocalList<Ativo>(VEICULOS_LOCAL_KEY).some(a => a.id === editingId)) {
      const updated = readLocalList<Ativo>(VEICULOS_LOCAL_KEY).map(a => a.id === editingId ? { ...a, ...editForm } : a);
      writeLocalList(VEICULOS_LOCAL_KEY, updated);
      toast.success('Atualizado no historico local');
      setEditingId(null);
      fetchAtivos();
      return;
    }
    const { error } = await supabase.from('ativos').update(editForm as any).eq('id', editingId);
    if (!error) {
      toast.success('Atualizado!');
      setEditingId(null);
      fetchAtivos();
    } else toast.error('Erro ao salvar');
  };

  const selectedAtivo = ativos.find(a => a.id === manutForm.ativo_id);

  const uploadManutencaoPdf = async () => {
    if (!manutFile || !session?.user?.id) return { url: null as string | null, nome: null as string | null };
    const ext = manutFile.name.split('.').pop() || 'pdf';
    const path = `${session.user.id}/manutencao/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const upload = await uploadDocumentoVeiculo(manutFile, path);
    return { url: upload.url, nome: manutFile.name };
  };

  const salvarManutencao = async () => {
    if (!session?.user?.id) { toast.error('Faca login primeiro'); return; }
    if (!manutForm.descricao.trim()) { toast.error('Informe a manutencao/mecanica'); return; }
    setUploading(true);
    try {
      const arquivo = await uploadManutencaoPdf();
      const payload = {
        ativo_id: selectedAtivo?.id || null,
        veiculo_descricao: selectedAtivo?.descricao || '',
        placa: selectedAtivo?.placa || '',
        data: manutForm.data,
        km: manutForm.km ? parseNumero(manutForm.km) : null,
        descricao: manutForm.descricao,
        fornecedor: manutForm.fornecedor || null,
        nota_numero: manutForm.nota_numero || null,
        valor: parseNumero(manutForm.valor),
        arquivo_url: arquivo.url,
        arquivo_nome: arquivo.nome,
        origem: 'manual',
        observacao: manutForm.observacao || null,
        created_by: session.user.id,
      };
      const { error } = await supabase.from('veiculo_manutencoes' as any).insert(payload);
      if (error) {
        if (isMissingSchema(error)) {
          const localManutencao: Manutencao = {
            id: newLocalId(),
            ativo_id: payload.ativo_id,
            veiculo_descricao: payload.veiculo_descricao,
            placa: payload.placa,
            data: payload.data,
            km: payload.km,
            descricao: payload.descricao,
            fornecedor: payload.fornecedor,
            nota_numero: payload.nota_numero,
            valor: payload.valor,
            arquivo_url: payload.arquivo_url,
            arquivo_nome: payload.arquivo_nome,
            origem: 'local',
            observacao: payload.observacao,
          };
          writeLocalList(MANUTENCOES_LOCAL_KEY, [localManutencao, ...readLocalList<Manutencao>(MANUTENCOES_LOCAL_KEY)]);
          setManutencaoErro('Tabela de manutencao ainda nao existe no Supabase. Historico salvo localmente por enquanto.');
        } else {
          throw error;
        }
      }
      toast.success('Manutencao salva no historico do carro');
      setManutForm({ ativo_id: '', data: new Date().toISOString().slice(0, 10), km: '', descricao: '', fornecedor: '', nota_numero: '', valor: '', observacao: '' });
      setManutFile(null);
      fetchManutencoes();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar manutencao');
    } finally {
      setUploading(false);
    }
  };

  const manutencoesFiltradas = useMemo(() => {
    const q = search.toLowerCase();
    return manutencoes.filter(m => !q ||
      `${m.veiculo_descricao || ''} ${m.placa || ''} ${m.descricao || ''} ${m.fornecedor || ''}`.toLowerCase().includes(q)
    );
  }, [manutencoes, search]);

  const filtered = useMemo(() => {
    let list = ativos;
    if (search) {
      const q = search.toLowerCase();
        list = list.filter(a =>
        (a.descricao || '').toLowerCase().includes(q) ||
        (a.placa || '').toLowerCase().includes(q) ||
          (a.patrimonio || '').toLowerCase().includes(q) ||
          (a.renavam || '').toLowerCase().includes(q) ||
          (a.chassi || '').toLowerCase().includes(q)
      );
    }
    if (filterType === 'ipva_vencer') list = list.filter(a => getAlertStatus(a.vencimento_ipva) === 'a_vencer');
    if (filterType === 'ipva_vencido') list = list.filter(a => getAlertStatus(a.vencimento_ipva) === 'vencido');
    if (filterType === 'lic_vencer') list = list.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'a_vencer');
    if (filterType === 'lic_vencido') list = list.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'vencido');
    return list;
  }, [ativos, search, filterType]);

  const alertCounts = useMemo(() => ({
    ipvaVencer: ativos.filter(a => getAlertStatus(a.vencimento_ipva) === 'a_vencer').length,
    ipvaVencido: ativos.filter(a => getAlertStatus(a.vencimento_ipva) === 'vencido').length,
    licVencer: ativos.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'a_vencer').length,
    licVencido: ativos.filter(a => getAlertStatus(a.vencimento_licenciamento) === 'vencido').length,
  }), [ativos]);

  const handlePrintBatch = () => {
    if (filtered.length === 0) { toast.error('Nenhum veiculo para imprimir'); return; }
    const rows = filtered.map(a => `<tr>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.descricao}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.placa || '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.patrimonio || '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.renavam || '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.chassi || '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${[a.ano_fabricacao, a.ano_modelo].filter(Boolean).join('/') || '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_ipva ? new Date(a.vencimento_ipva).toLocaleDateString('pt-BR') : '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.vencimento_licenciamento ? new Date(a.vencimento_licenciamento).toLocaleDateString('pt-BR') : '-'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px">${a.empresa}</td>
    </tr>`).join('');

    const filterLabel = filterType === 'todos' ? 'Todos os Veiculos' :
      filterType === 'ipva_vencer' ? 'IPVA a Vencer' :
      filterType === 'ipva_vencido' ? 'IPVA Vencido' :
      filterType === 'lic_vencer' ? 'Licenciamento a Vencer' : 'Licenciamento Vencido';

    const html = `<!DOCTYPE html><html><head><title>Documentos de Veiculos</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    h1{font-size:16px;margin-bottom:4px}h2{font-size:12px;color:#666;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th{background:#f5f5f5;padding:6px 8px;border:1px solid #ccc;font-size:10px;text-transform:uppercase;text-align:left}
    </style></head><body>
    <h1>Documentos de Veiculos - ${filterLabel}</h1>
    <h2>${filtered.length} veiculo(s) - Gerado em ${new Date().toLocaleDateString('pt-BR')}</h2>
    <table><thead><tr><th>Descricao</th><th>Placa</th><th>Patrimonio</th><th>Renavam</th><th>Chassi</th><th>Ano</th><th>Venc. IPVA</th><th>Venc. Licenciamento</th><th>Empresa</th></tr></thead>
    <tbody>${rows}</tbody></table>
    </body></html>`;
    printDocumentInPage(html);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Documentos de Veiculos</h1>
            <p className="text-primary-foreground/70 text-sm">Upload multiplo de PDFs com leitura automatica por IA - Alertas de IPVA e Licenciamento</p>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {(alertCounts.ipvaVencido > 0 || alertCounts.licVencido > 0 || alertCounts.ipvaVencer > 0 || alertCounts.licVencer > 0) && (
        <div className="card-premium p-4 border-l-4 border-warning bg-warning/5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm font-bold text-foreground">Alertas de Documentacao</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {alertCounts.ipvaVencido > 0 && (
              <button onClick={() => setFilterType('ipva_vencido')}
                className="px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">
                {alertCounts.ipvaVencido} IPVA vencido(s)
              </button>
            )}
            {alertCounts.ipvaVencer > 0 && (
              <button onClick={() => setFilterType('ipva_vencer')}
                className="px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20">
                {alertCounts.ipvaVencer} IPVA a vencer
              </button>
            )}
            {alertCounts.licVencido > 0 && (
              <button onClick={() => setFilterType('lic_vencido')}
                className="px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">
                {alertCounts.licVencido} Licenciamento vencido(s)
              </button>
            )}
            {alertCounts.licVencer > 0 && (
              <button onClick={() => setFilterType('lic_vencer')}
                className="px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20">
                {alertCounts.licVencer} Licenciamento a vencer
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por descricao, placa, RENAVAM ou chassi..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
          <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="todos">Todos</option>
            <option value="ipva_vencer">IPVA a Vencer</option>
            <option value="ipva_vencido">IPVA Vencido</option>
            <option value="lic_vencer">Lic. a Vencer</option>
            <option value="lic_vencido">Lic. Vencido</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <Button size="sm" disabled={uploading} asChild>
              <span>
                {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {uploading ? 'Enviando...' : 'Upload PDFs'}
              </span>
            </Button>
            <input type="file" accept=".pdf" multiple className="hidden"
              onChange={e => e.target.files && e.target.files.length > 0 && handleMultiUpload(e.target.files)} />
          </label>
          <Button size="sm" variant="outline" onClick={handlePrintBatch}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir Lote
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Ao subir PDFs, a IA tenta extrair placa, renavam, chassi e outros dados. Dados reaproveitados no Protocolo.
        </p>
        {ativosErro && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {ativosErro}
          </div>
        )}
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold">Manutencao / mecanica do veiculo</h2>
              <p className="text-xs text-muted-foreground">Suba PDF, informe KM e custo. O registro fica no historico do carro.</p>
            </div>
          </div>
          <Badge variant="outline">{manutencoesFiltradas.length} historico(s)</Badge>
        </div>

        {manutencaoErro && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {manutencaoErro}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Carro</label>
            <select value={manutForm.ativo_id} onChange={e => setManutForm({ ...manutForm, ativo_id: e.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Selecionar veiculo</option>
              {ativos.map(a => <option key={a.id} value={a.id}>{[a.descricao, a.placa || a.patrimonio].filter(Boolean).join(' - ')}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-muted-foreground block mb-1">Data</label><Input type="date" value={manutForm.data} onChange={e => setManutForm({ ...manutForm, data: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">KM</label><Input value={manutForm.km} onChange={e => setManutForm({ ...manutForm, km: e.target.value })} placeholder="Ex.: 99439" /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Total</label><Input value={manutForm.valor} onChange={e => setManutForm({ ...manutForm, valor: e.target.value })} placeholder="R$ 300,00" /></div>
          <div className="md:col-span-2"><label className="text-xs text-muted-foreground block mb-1">Manutencao / mecanica</label><Input value={manutForm.descricao} onChange={e => setManutForm({ ...manutForm, descricao: e.target.value })} placeholder="Ex.: 4 litros de oleo, filtro, rolamento..." /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Fornecedor</label><Input value={manutForm.fornecedor} onChange={e => setManutForm({ ...manutForm, fornecedor: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Nota</label><Input value={manutForm.nota_numero} onChange={e => setManutForm({ ...manutForm, nota_numero: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="text-xs text-muted-foreground block mb-1">Observacao</label><Input value={manutForm.observacao} onChange={e => setManutForm({ ...manutForm, observacao: e.target.value })} /></div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PDF da nota/manutencao</label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm cursor-pointer hover:bg-muted/50">
              <Paperclip className="w-4 h-4" /> {manutFile ? manutFile.name : 'Selecionar PDF'}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setManutFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="flex items-end"><Button onClick={salvarManutencao} disabled={uploading} className="w-full"><Save className="w-4 h-4 mr-1" /> Salvar historico</Button></div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs uppercase text-muted-foreground">Data</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-muted-foreground">Veiculo</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-muted-foreground">Manutencao</th>
              <th className="px-3 py-2 text-right text-xs uppercase text-muted-foreground">KM</th>
              <th className="px-3 py-2 text-right text-xs uppercase text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-muted-foreground">PDF</th>
            </tr></thead>
            <tbody>
              {manutencoesFiltradas.map(m => (
                <tr key={m.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{m.data ? new Date(`${m.data}T00:00:00`).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-3 py-2 text-xs">{[m.veiculo_descricao, m.placa].filter(Boolean).join(' - ') || '-'}</td>
                  <td className="px-3 py-2 text-xs max-w-[420px]">{m.descricao}</td>
                  <td className="px-3 py-2 text-right text-xs">{m.km ?? '-'}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{moeda(m.valor)}</td>
                  <td className="px-3 py-2 text-xs">{m.arquivo_url ? <button onClick={() => setViewingPdf({ url: m.arquivo_url!, descricao: m.arquivo_nome || m.descricao })} className="text-primary hover:underline">Ver PDF</button> : '-'}</td>
                </tr>
              ))}
              {manutencoesFiltradas.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm text-muted-foreground">Nenhuma manutencao registrada</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inline edit form */}
      {editingId && (
        <div className="card-premium p-5 space-y-3 border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Editando Documento</h3>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Descricao</label>
              <Input value={editForm.descricao || ''} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Placa</label>
              <Input value={editForm.placa || ''} onChange={e => setEditForm({ ...editForm, placa: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Patrimonio</label>
              <Input value={editForm.patrimonio || ''} onChange={e => setEditForm({ ...editForm, patrimonio: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Renavam</label>
              <Input value={editForm.renavam || ''} onChange={e => setEditForm({ ...editForm, renavam: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Chassi</label>
              <Input value={editForm.chassi || ''} onChange={e => setEditForm({ ...editForm, chassi: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Empresa</label>
              <Input value={editForm.empresa || ''} onChange={e => setEditForm({ ...editForm, empresa: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. IPVA</label>
              <Input type="date" value={editForm.vencimento_ipva || ''} onChange={e => setEditForm({ ...editForm, vencimento_ipva: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Venc. Licenciamento</label>
              <Input type="date" value={editForm.vencimento_licenciamento || ''} onChange={e => setEditForm({ ...editForm, vencimento_licenciamento: e.target.value })} /></div>
          </div>
          <Button onClick={handleSaveEdit}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
        </div>
      )}

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 sticky top-0 z-10">
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Descricao</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Placa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Patrimonio</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Renavam</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Chassi</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ano</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">IPVA</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Licenciamento</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">PDF</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Acoes</th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs font-medium">{a.descricao}</td>
                <td className="px-3 py-2 text-xs">{a.placa || '-'}</td>
                <td className="px-3 py-2 text-xs">{a.patrimonio || '-'}</td>
                <td className="px-3 py-2 text-xs">{a.renavam || '-'}</td>
                <td className="px-3 py-2 text-xs">{a.chassi || '-'}</td>
                <td className="px-3 py-2 text-xs">{[a.ano_fabricacao, a.ano_modelo].filter(Boolean).join('/') || '-'}</td>
                <td className="px-3 py-2">{statusBadge(getAlertStatus(a.vencimento_ipva))}</td>
                <td className="px-3 py-2">{statusBadge(getAlertStatus(a.vencimento_licenciamento))}</td>
                <td className="px-3 py-2 text-xs">{a.empresa}</td>
                <td className="px-3 py-2 text-xs">
                  {a.arquivo_url ? <button onClick={() => setViewingPdf({ url: a.arquivo_url, descricao: a.descricao })} className="text-primary hover:underline flex items-center gap-1 text-xs"><Eye className="w-3 h-3" />Ver</button> : '-'}
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(a)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground text-sm">Nenhum documento encontrado</td></tr>}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filtered.length} documento(s)</div>
      </div>

      {/* Internal PDF Viewer Modal */}
      <Dialog open={!!viewingPdf} onOpenChange={(open) => !open && setViewingPdf(null)}>
        <DialogContent className="max-w-6xl overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">{viewingPdf?.descricao || 'Documento do veiculo'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <PdfDocumentViewer
              source={viewingPdf ? { url: viewingPdf.url, tipo: 'veiculo' } : undefined}
              title={viewingPdf?.descricao || 'Documento do veiculo'}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosVeiculosPage;
